import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
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
  const cookie = signup.headers["set-cookie"];
  const person = await request(app)
    .post("/api/people")
    .set("Cookie", cookie)
    .send({ name: "Avery", email: "" });
  return { app, cookie, personPublicId: person.body.person.publicId };
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
});
