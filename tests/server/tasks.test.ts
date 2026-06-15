import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";
import type { EmailMessage, EmailSender } from "../../server/email/mailer";
import { sendAutomaticTaskReminders } from "../../server/tasks/reminders";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup(options: { personEmail?: string } = {}) {
  vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const sentEmails: EmailMessage[] = [];
  const emailSender: EmailSender = {
    send: vi.fn(async (message) => {
      sentEmails.push(message);
    }),
  };
  const app = createApp({
    db,
    emailSender,
    config: { ...loadConfig(), appBaseUrl: "https://philippe-tasks.net" },
  });
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });
  const cookie = signup.headers["set-cookie"];
  const person = await request(app)
    .post("/api/people")
    .set("Cookie", cookie)
    .send({ name: "Avery", email: options.personEmail ?? "" });
  return {
    app,
    db,
    config: app.locals.config,
    cookie,
    personPublicId: person.body.person.publicId,
    sentEmails,
    emailSender,
  };
}

afterEach(() => {
  vi.useRealTimers();
  for (const db of dbs.splice(0)) db.close();
});

describe("tasks", () => {
  it("creates, filters, edits, and archives tasks", async () => {
    const { app, cookie, personPublicId } = await setup();

    const created = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Send notes",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
    });

    expect(created.status).toBe(201);
    expect(created.body.task.publicId).toBe("T001");
    expect(created.body.task.reminderMode).toBe("automatic");
    expect(created.body.task.alert).toBe("dueSoon");

    const filtered = await request(app)
      .get(`/api/tasks?assigneePublicId=${personPublicId}&status=Open&alert=dueSoon`)
      .set("Cookie", cookie);

    expect(filtered.body.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
    ]);

    const edited = await request(app)
      .patch("/api/tasks/T001")
      .set("Cookie", cookie)
      .send({
        description: "Send final notes",
        assigneePublicId: personPublicId,
        status: "Done",
        dueDate: "2026-06-12",
      });

    expect(edited.body.task.status).toBe("Done");
    expect(edited.body.task.alert).toBeNull();

    const archived = await request(app).post("/api/tasks/T001/archive").set("Cookie", cookie);
    expect(archived.status).toBe(204);
  });

  it("records task audit history", async () => {
    const { app, cookie, personPublicId } = await setup();

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Send notes",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
    });

    await request(app)
      .patch("/api/tasks/T001")
      .set("Cookie", cookie)
      .send({
        description: "Send final notes",
        assigneePublicId: personPublicId,
        status: "Done",
        dueDate: "2026-06-12",
      });

    const audit = await request(app).get("/api/tasks/T001/audit").set("Cookie", cookie);

    expect(audit.status).toBe(200);
    expect(audit.body.auditEvents).toEqual([
      expect.objectContaining({
        action: "updated",
        actorName: "Editor",
        entityPublicId: "T001",
        entityType: "task",
        summary: "Updated task details",
      }),
      expect.objectContaining({
        action: "created",
        actorName: "Editor",
        summary: "Created task",
      }),
    ]);
    expect(audit.body.auditEvents[0].changes.after.description).toBe("Send final notes");
  });

  it("marks overdue tasks", async () => {
    const { app, cookie, personPublicId } = await setup();

    const created = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Past due work",
      assigneePublicId: personPublicId,
      status: "Blocked",
      dueDate: "2026-06-01",
    });

    expect(created.body.task.alert).toBe("overdue");
  });

  it("sends manual email reminders for outstanding tasks", async () => {
    const { app, cookie, personPublicId, sentEmails } = await setup({
      personEmail: "avery@example.com",
    });

    const created = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Send notes",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
      reminderMode: "manual",
    });

    expect(created.body.task.reminderMode).toBe("manual");
    expect(created.body.task.lastReminderSentAt).toBeNull();

    const reminder = await request(app).post("/api/tasks/T001/reminders").set("Cookie", cookie);

    expect(reminder.status).toBe(201);
    expect(reminder.body.reminder).toEqual(
      expect.objectContaining({
        taskPublicId: "T001",
        recipientEmail: "avery@example.com",
        mode: "manual",
      }),
    );
    expect(sentEmails).toEqual([
      expect.objectContaining({
        to: "avery@example.com",
        subject: "T001 is due soon: Send notes",
        text: [
          "Hi Avery,",
          "",
          "Just a reminder that Philippe will want to talk about a task assigned to you soon.  The notes that this humble computer has say: Send notes (task number: T001).   The status is currently set as Open, with a due date of 2026-06-12.",
          "",
          "If you have any questions, please see Philippe.",
          "",
          "To manually manage tasks, ask for access to https://philippe-tasks.net.",
        ].join("\n"),
      }),
    ]);

    const task = await request(app).get("/api/tasks/T001").set("Cookie", cookie);
    expect(task.body.task.lastReminderSentAt).toBe(reminder.body.reminder.sentAt);

    const audit = await request(app).get("/api/tasks/T001/audit").set("Cookie", cookie);
    expect(audit.body.auditEvents[0]).toEqual(
      expect.objectContaining({
        action: "reminder_sent",
        summary: "Sent manual reminder to Avery",
      }),
    );
  });

  it("sends automatic reminders for automatic due tasks once per day", async () => {
    const { app, db, config, cookie, personPublicId, sentEmails, emailSender } = await setup({
      personEmail: "avery@example.com",
    });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Automatic task",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
      reminderMode: "automatic",
    });
    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Manual task",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
      reminderMode: "manual",
    });

    const firstRun = await sendAutomaticTaskReminders(
      db,
      config,
      emailSender,
      new Date("2026-06-09T12:00:00Z"),
    );

    expect(firstRun.sent.map((item) => item.taskPublicId)).toEqual(["T001"]);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].subject).toBe("T001 is due soon: Automatic task");

    const secondRun = await sendAutomaticTaskReminders(
      db,
      config,
      emailSender,
      new Date("2026-06-09T18:00:00Z"),
    );

    expect(secondRun.sent).toEqual([]);
    expect(secondRun.skipped).toEqual([
      { taskPublicId: "T001", reason: "already_sent_today" },
    ]);
    expect(sentEmails).toHaveLength(1);
  });

  it("keeps private tasks visible only to their creator", async () => {
    const { app, cookie, personPublicId } = await setup();
    const viewerSignup = await request(app).post("/api/auth/signup").send({
      name: "Viewer",
      email: "viewer@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });
    const viewerCookie = viewerSignup.headers["set-cookie"];

    const privateTask = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Private task",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
      private: true,
    });

    expect(privateTask.status).toBe(201);
    expect(privateTask.body.task.private).toBe(true);

    const ownerList = await request(app).get("/api/tasks").set("Cookie", cookie);
    expect(ownerList.body.tasks.map((task: { publicId: string }) => task.publicId)).toContain(
      "T001",
    );

    const viewerList = await request(app).get("/api/tasks").set("Cookie", viewerCookie);
    expect(viewerList.body.tasks.map((task: { publicId: string }) => task.publicId)).not.toContain(
      "T001",
    );

    const viewerGet = await request(app).get("/api/tasks/T001").set("Cookie", viewerCookie);
    expect(viewerGet.status).toBe(404);

    const viewerAudit = await request(app)
      .get("/api/tasks/T001/audit")
      .set("Cookie", viewerCookie);
    expect(viewerAudit.status).toBe(404);
  });
});
