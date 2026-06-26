import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

function appWithDatabase() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  return { app: createApp({ db }), db };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("waitlist", () => {
  it("stores a public beta waitlist signup with a normalized email", async () => {
    const { app, db } = appWithDatabase();

    const response = await request(app).post("/api/waitlist").send({
      name: "  Morgan Lee  ",
      email: "  Morgan@example.COM ",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });

    const signup = db
      .prepare("SELECT name, email FROM waitlist_signups")
      .get() as { name: string; email: string };
    expect(signup).toEqual({
      name: "Morgan Lee",
      email: "morgan@example.com",
    });
  });

  it("rejects invalid waitlist submissions", async () => {
    const { app } = appWithDatabase();

    const response = await request(app).post("/api/waitlist").send({
      name: "",
      email: "not-an-email",
    });

    expect(response.status).toBe(400);
  });
});
