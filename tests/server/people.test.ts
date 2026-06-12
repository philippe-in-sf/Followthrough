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

  it("requires login", async () => {
    const { app } = await loggedInApp();
    const response = await request(app).get("/api/people");
    expect(response.status).toBe(401);
  });
});
