import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function loggedInApp() {
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
  vi.useRealTimers();
  for (const db of dbs.splice(0)) db.close();
});

describe("people", () => {
  it("creates, lists, edits, and archives people", async () => {
    const { app, cookie } = await loggedInApp();

    const created = await request(app)
      .post("/api/people")
      .set("Cookie", cookie)
      .send({ name: "Jordan Lee", email: "jordan@example.com" });

    expect(created.status).toBe(201);
    expect(created.body.person.publicId).toBe("P001");

    const list = await request(app).get("/api/people").set("Cookie", cookie);
    expect(list.body.people).toHaveLength(1);

    const edited = await request(app)
      .patch(`/api/people/${created.body.person.publicId}`)
      .set("Cookie", cookie)
      .send({ name: "Jordan L.", email: "" });

    expect(edited.body.person.email).toBeNull();

    const archived = await request(app)
      .post(`/api/people/${created.body.person.publicId}/archive`)
      .set("Cookie", cookie);

    expect(archived.status).toBe(204);

    const activeList = await request(app).get("/api/people").set("Cookie", cookie);
    expect(activeList.body.people).toHaveLength(0);
  });

  it("records person audit history", async () => {
    vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
    const { app, cookie } = await loggedInApp();

    await request(app)
      .post("/api/people")
      .set("Cookie", cookie)
      .send({ name: "Jordan Lee", email: "jordan@example.com" });

    await request(app)
      .patch("/api/people/P001")
      .set("Cookie", cookie)
      .send({ name: "Jordan L.", email: "" });

    const audit = await request(app).get("/api/people/P001/audit").set("Cookie", cookie);

    expect(audit.status).toBe(200);
    expect(audit.body.auditEvents).toEqual([
      expect.objectContaining({
        action: "updated",
        actorName: "Editor",
        entityPublicId: "P001",
        entityType: "person",
        summary: "Updated person details",
      }),
      expect.objectContaining({
        action: "created",
        actorName: "Editor",
        summary: "Created person",
      }),
    ]);
    expect(audit.body.auditEvents[0].changes.before.email).toBe("jordan@example.com");
    expect(audit.body.auditEvents[0].changes.after.email).toBeNull();
  });

  it("lists tasks, meetings, and decisions related to a person", async () => {
    const { app, cookie } = await loggedInApp();

    const person = await request(app)
      .post("/api/people")
      .set("Cookie", cookie)
      .send({ name: "Avery", email: "avery@example.com" });
    await request(app)
      .post("/api/people")
      .set("Cookie", cookie)
      .send({ name: "Morgan", email: "morgan@example.com" });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Send notes",
      assigneePublicId: person.body.person.publicId,
      status: "Open",
      dueDate: "2026-06-12",
    });
    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Unrelated task",
      assigneePublicId: "P002",
      status: "Open",
      dueDate: "2026-06-13",
    });
    await request(app).post("/api/meetings").set("Cookie", cookie).send({
      title: "Planning sync",
      startsAt: "2026-06-10T15:00:00.000Z",
      meetingType: "single",
      seriesPublicId: null,
      summary: "Discuss launch",
      attendeePublicIds: [person.body.person.publicId],
      taskPublicIds: [],
    });
    await request(app).post("/api/meetings").set("Cookie", cookie).send({
      title: "Unrelated sync",
      startsAt: "2026-06-11T15:00:00.000Z",
      meetingType: "single",
      seriesPublicId: null,
      summary: "",
      attendeePublicIds: ["P002"],
      taskPublicIds: [],
    });
    await request(app).post("/api/decisions").set("Cookie", cookie).send({
      decisionText: "Ship the launch plan",
      decisionDate: "2026-06-10",
      context: "Planning sync",
      meetingPublicId: "M001",
    });
    await request(app).post("/api/decisions").set("Cookie", cookie).send({
      decisionText: "Keep unrelated context",
      decisionDate: "2026-06-11",
      context: "Other meeting",
      meetingPublicId: "M002",
    });

    const records = await request(app)
      .get(`/api/people/${person.body.person.publicId}/records`)
      .set("Cookie", cookie);

    expect(records.status).toBe(200);
    expect(records.body.person).toEqual(
      expect.objectContaining({ publicId: "P001", name: "Avery" }),
    );
    expect(records.body.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
    ]);
    expect(records.body.meetings.map((meeting: { publicId: string }) => meeting.publicId)).toEqual(
      ["M001"],
    );
    expect(
      records.body.decisions.map((decision: { publicId: string }) => decision.publicId),
    ).toEqual(["D001"]);
  });

  it("requires login", async () => {
    const { app } = await loggedInApp();
    const response = await request(app).get("/api/people");
    expect(response.status).toBe(401);
  });
});
