import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createUser } from "../../server/auth/userManagement";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

function appWithInvite(code = "join-team") {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, label, usage_limit) VALUES (?, ?, ?)").run(
    code,
    "Test invite",
    5,
  );
  return createApp({ db });
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("auth", () => {
  it("signs up with an active invite code and returns the current user", async () => {
    const app = appWithInvite();

    const signup = await request(app).post("/api/auth/signup").send({
      name: "Philippe",
      email: "philippe@example.com",
      password: "long-enough-password",
      inviteCode: "join-team",
    });

    expect(signup.status).toBe(201);
    expect(signup.headers["set-cookie"]?.[0]).toContain("tm_session=");
    expect(signup.body.user).toMatchObject({
      name: "Philippe",
      email: "philippe@example.com",
      role: "member",
      team: {
        id: 1,
        name: "Default Team",
        logoUrl: null,
        workCalendarUrl: null,
      },
    });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", signup.headers["set-cookie"]);

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      email: "philippe@example.com",
      role: "member",
      team: {
        id: 1,
        name: "Default Team",
        logoUrl: null,
        workCalendarUrl: null,
      },
    });
  });

  it("rejects signup with a bad invite code", async () => {
    const app = appWithInvite();

    const response = await request(app).post("/api/auth/signup").send({
      name: "Nope",
      email: "nope@example.com",
      password: "long-enough-password",
      inviteCode: "wrong",
    });

    expect(response.status).toBe(400);
  });

  it("logs in and logs out", async () => {
    const app = appWithInvite();

    await request(app).post("/api/auth/signup").send({
      name: "Casey",
      email: "casey@example.com",
      password: "long-enough-password",
      inviteCode: "join-team",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: "casey@example.com",
      password: "long-enough-password",
    });

    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"]?.[0]).toContain("tm_session=");

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", login.headers["set-cookie"]);

    expect(logout.status).toBe(204);
  });

  it("creates a direct database user that can log in", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);
    const app = createApp({ db });

    const user = await createUser(db, {
      name: "Direct User",
      email: "Direct@example.com",
      password: "long-enough-password",
    });

    expect(user.email).toBe("direct@example.com");

    const login = await request(app).post("/api/auth/login").send({
      email: "direct@example.com",
      password: "long-enough-password",
    });

    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({
      name: "Direct User",
      email: "direct@example.com",
      role: "admin",
      team: {
        id: 1,
        name: "Default Team",
        logoUrl: null,
        workCalendarUrl: null,
      },
    });
  });

  it("creates a direct admin user when a role is supplied", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const user = await createUser(db, {
      name: "Admin User",
      email: "admin@example.com",
      password: "long-enough-password",
      role: "admin",
    });

    expect(user).toMatchObject({
      email: "admin@example.com",
      role: "admin",
      teamId: 1,
    });
  });
});
