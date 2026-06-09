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
});
