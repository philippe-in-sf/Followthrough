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
    config: { ...loadConfig(), appBaseUrl: "https://followthrough.dev", sessionTtlDays: 3650 },
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
  sentEmails.length = 0;
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
      blockers: "Waiting on legal sign-off",
      notes: "Drafted the first pass and sent it to legal.",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
    });

    expect(created.status).toBe(201);
    expect(created.body.task.publicId).toBe("T001");
    expect(created.body.task.blockers).toBe("Waiting on legal sign-off");
    expect(created.body.task.notes).toBe("Drafted the first pass and sent it to legal.");
    expect(created.body.task.blockersClearedAt).toBeNull();
    expect(created.body.task.reminderMode).toBe("manual");
    expect(created.body.task.dependencies).toEqual([]);
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
    expect(edited.body.task.blockers).toBe("Waiting on legal sign-off");
    expect(edited.body.task.notes).toBe("Drafted the first pass and sent it to legal.");
    expect(edited.body.task.blockersClearedAt).toBeNull();
    expect(edited.body.task.alert).toBeNull();

    const cleared = await request(app)
      .patch("/api/tasks/T001")
      .set("Cookie", cookie)
      .send({
        description: "Send final notes",
        notes: "Legal approved the language.",
        blockersCleared: true,
        assigneePublicId: personPublicId,
        status: "Done",
        dueDate: "2026-06-12",
      });

    expect(cleared.body.task.blockers).toBe("Waiting on legal sign-off");
    expect(cleared.body.task.notes).toBe("Legal approved the language.");
    expect(cleared.body.task.blockersClearedAt).toEqual(expect.any(String));

    const archived = await request(app).post("/api/tasks/T001/archive").set("Cookie", cookie);
    expect(archived.status).toBe(204);

    const activeAfterArchive = await request(app).get("/api/tasks").set("Cookie", cookie);
    expect(
      activeAfterArchive.body.tasks.map((task: { publicId: string }) => task.publicId),
    ).not.toContain("T001");

    const archivedList = await request(app).get("/api/tasks?archived=true").set("Cookie", cookie);
    expect(archivedList.body.tasks).toEqual([
      expect.objectContaining({ publicId: "T001", archived: true }),
    ]);

    const archivedAudit = await request(app).get("/api/tasks/T001/audit").set("Cookie", cookie);
    expect(archivedAudit.status).toBe(200);

    const restored = await request(app).post("/api/tasks/T001/restore").set("Cookie", cookie);
    expect(restored.status).toBe(200);
    expect(restored.body.task).toEqual(expect.objectContaining({ publicId: "T001", archived: false }));

    const activeAfterRestore = await request(app).get("/api/tasks").set("Cookie", cookie);
    expect(
      activeAfterRestore.body.tasks.map((task: { publicId: string }) => task.publicId),
    ).toContain("T001");
  });

  it("filters tasks assigned to the signed-in user's matching person record", async () => {
    const { app, cookie, personPublicId } = await setup({ personEmail: "EDITOR@example.com" });
    const otherPerson = await request(app)
      .post("/api/people")
      .set("Cookie", cookie)
      .send({ name: "Blake", email: "blake@example.com" });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "My follow-up",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
    });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Someone else's follow-up",
      assigneePublicId: otherPerson.body.person.publicId,
      status: "Open",
      dueDate: "2026-06-12",
    });

    const assignedToMe = await request(app)
      .get("/api/tasks?assignedToMe=true")
      .set("Cookie", cookie);

    expect(assignedToMe.status).toBe(200);
    expect(assignedToMe.body.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
    ]);
  });

  it("tracks task dependencies and rejects invalid dependency graphs", async () => {
    const { app, cookie, personPublicId } = await setup();

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Collect requirements",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-10",
    });

    const dependent = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Build the thing",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-12",
      dependencyPublicIds: ["T001"],
    });

    expect(dependent.status).toBe(201);
    expect(dependent.body.task.dependencies).toEqual([
      {
        publicId: "T001",
        description: "Collect requirements",
        status: "Open",
        archived: false,
      },
    ]);

    const listed = await request(app).get("/api/tasks").set("Cookie", cookie);
    expect(
      listed.body.tasks.find((task: { publicId: string }) => task.publicId === "T002")
        .dependencies,
    ).toEqual([
      expect.objectContaining({
        publicId: "T001",
        description: "Collect requirements",
      }),
    ]);

    const selfDependency = await request(app)
      .patch("/api/tasks/T001")
      .set("Cookie", cookie)
      .send({
        description: "Collect requirements",
        assigneePublicId: personPublicId,
        status: "Open",
        dueDate: "2026-06-10",
        dependencyPublicIds: ["T001"],
      });
    expect(selfDependency.status).toBe(400);

    const cycle = await request(app)
      .patch("/api/tasks/T001")
      .set("Cookie", cookie)
      .send({
        description: "Collect requirements",
        assigneePublicId: personPublicId,
        status: "Open",
        dueDate: "2026-06-10",
        dependencyPublicIds: ["T002"],
      });
    expect(cycle.status).toBe(400);

    const cleared = await request(app)
      .patch("/api/tasks/T002")
      .set("Cookie", cookie)
      .send({
        description: "Build the thing",
        assigneePublicId: personPublicId,
        status: "Open",
        dueDate: "2026-06-12",
        dependencyPublicIds: [],
      });
    expect(cleared.status).toBe(200);
    expect(cleared.body.task.dependencies).toEqual([]);

    const audit = await request(app).get("/api/tasks/T002/audit").set("Cookie", cookie);
    expect(audit.status).toBe(200);
    expect(audit.body.auditEvents[0]).toEqual(
      expect.objectContaining({
        action: "updated",
        summary: "Updated task details",
      }),
    );
    expect(audit.body.auditEvents[0].changes.before.dependencies).toEqual([
      {
        publicId: "T001",
        description: "Collect requirements",
        status: "Open",
        archived: false,
      },
    ]);
    expect(audit.body.auditEvents[0].changes.after.dependencies).toEqual([]);
    expect(audit.body.auditEvents[1]).toEqual(
      expect.objectContaining({
        action: "created",
        summary: "Created task",
      }),
    );
    expect(audit.body.auditEvents[1].changes.after.dependencies).toEqual([
      {
        publicId: "T001",
        description: "Collect requirements",
        status: "Open",
        archived: false,
      },
    ]);
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

  it("records browser notifications when a task is assigned to a team user", async () => {
    const { app, cookie } = await setup({ personEmail: "assignee@example.com" });

    const signup = await request(app).post("/api/auth/signup").send({
      name: "Assignee",
      email: "assignee@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });
    const assigneeCookie = signup.headers["set-cookie"];

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Review the rollout plan",
      assigneePublicId: "P001",
      status: "Open",
      dueDate: "2026-06-12",
    });

    const notifications = await request(app)
      .get("/api/notifications/task-assignments")
      .set("Cookie", assigneeCookie);

    expect(notifications.status).toBe(200);
    expect(notifications.body.notifications).toEqual([
      expect.objectContaining({
        taskPublicId: "T001",
        taskDescription: "Review the rollout plan",
        triggeredByName: "Editor",
      }),
    ]);

    const notificationId = notifications.body.notifications[0].id;
    const markedRead = await request(app)
      .post(`/api/notifications/task-assignments/${notificationId}/read`)
      .set("Cookie", assigneeCookie);

    expect(markedRead.status).toBe(204);

    const afterRead = await request(app)
      .get("/api/notifications/task-assignments")
      .set("Cookie", assigneeCookie);
    expect(afterRead.body.notifications).toEqual([]);
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
        subject: "Followthrough: Task T001 is due soon",
        text: [
          "Hi Avery,",
          "",
          "Just a reminder that Philippe will want to talk about a task assigned to you soon.  The notes that this humble computer has say: Send notes (task number: T001).   The status is currently set as Open, with a due date of 2026-06-12.",
          "",
          "If you have any questions, please see Philippe.",
          "",
          "To manually manage tasks, ask for access to https://followthrough.dev.",
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
    expect(sentEmails[0].subject).toBe("Followthrough: Task T001 is due soon");

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
