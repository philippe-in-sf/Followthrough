import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const app = createApp({ db });
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });
  return { app, cookie: signup.headers["set-cookie"] };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("decisions", () => {
  it("creates, lists, edits, and archives decisions", async () => {
    const { app, cookie } = await setup();

    const meeting = await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Planning",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "",
        attendeePublicIds: [],
        taskPublicIds: [],
      });

    const created = await request(app).post("/api/decisions").set("Cookie", cookie).send({
      decisionText: "Use SQLite for v1",
      decisionDate: "2026-06-09",
      context: "Single-server deployment.",
      meetingPublicId: meeting.body.meeting.publicId,
    });

    expect(created.status).toBe(201);
    expect(created.body.decision.publicId).toBe("D001");
    expect(created.body.decision.meetingPublicId).toBe("M001");

    const list = await request(app).get("/api/decisions").set("Cookie", cookie);
    expect(list.body.decisions).toHaveLength(1);

    const edited = await request(app).patch("/api/decisions/D001").set("Cookie", cookie).send({
      decisionText: "Use SQLite for the first release",
      decisionDate: "2026-06-09",
      context: "Keeps deployment simple.",
      meetingPublicId: "M001",
    });

    expect(edited.body.decision.context).toBe("Keeps deployment simple.");

    const archived = await request(app).post("/api/decisions/D001/archive").set("Cookie", cookie);
    expect(archived.status).toBe(204);
  });

  it("creates a linked follow-up task from a decision", async () => {
    const { app, cookie } = await setup();

    const person = await request(app)
      .post("/api/people")
      .set("Cookie", cookie)
      .send({ name: "Avery", email: "avery@example.com" });
    const meeting = await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Launch review",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "",
        attendeePublicIds: [],
        taskPublicIds: [],
      });

    const created = await request(app)
      .post("/api/decisions")
      .set("Cookie", cookie)
      .send({
        decisionText: "Launch with a weekly review loop",
        decisionDate: "2026-06-09",
        context: "The team needs a lightweight operating rhythm.",
        meetingPublicId: meeting.body.meeting.publicId,
        followUpTask: {
          description: "Schedule the first weekly review",
          assigneePublicId: person.body.person.publicId,
          dueDate: "2026-06-12",
        },
      });

    expect(created.status).toBe(201);
    expect(created.body.decision.tasks).toEqual([
      expect.objectContaining({
        publicId: "T001",
        description: "Schedule the first weekly review",
        dueDate: "2026-06-12",
        originDecisionPublicId: "D001",
        originMeetingPublicId: "M001",
        assignee: expect.objectContaining({ publicId: "P001" }),
      }),
    ]);

    const tasks = await request(app).get("/api/tasks").set("Cookie", cookie);
    expect(tasks.body.tasks).toEqual([
      expect.objectContaining({
        publicId: "T001",
        originDecisionPublicId: "D001",
      }),
    ]);

    const audit = await request(app).get("/api/decisions/D001/audit").set("Cookie", cookie);
    expect(audit.body.auditEvents[0]).toEqual(
      expect.objectContaining({
        action: "task_added",
        summary: "Added task T001",
      }),
    );
  });

  it("lists and audits tasks spawned by a decision", async () => {
    const { app, cookie } = await setup();

    await request(app).post("/api/decisions").set("Cookie", cookie).send({
      decisionText: "Launch with the lightweight checklist",
      decisionDate: "2026-06-09",
      context: "The team agreed to keep the first release narrow.",
    });

    const task = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Write the launch checklist",
      status: "Open",
      dueDate: "2026-06-12",
      originDecisionPublicId: "D001",
    });

    expect(task.status).toBe(201);
    expect(task.body.task.originDecisionPublicId).toBe("D001");

    const decision = await request(app).get("/api/decisions/D001").set("Cookie", cookie);
    expect(decision.status).toBe(200);
    expect(decision.body.decision.tasks).toEqual([
      expect.objectContaining({
        publicId: "T001",
        description: "Write the launch checklist",
      }),
    ]);

    const audit = await request(app).get("/api/decisions/D001/audit").set("Cookie", cookie);
    expect(audit.status).toBe(200);
    expect(audit.body.auditEvents[0]).toEqual(
      expect.objectContaining({
        action: "task_added",
        entityPublicId: "D001",
        entityType: "decision",
        summary: "Added task T001",
      }),
    );
    expect(audit.body.auditEvents[0].changes.task.originDecisionPublicId).toBe("D001");
  });
});
