import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createUser } from "../../server/auth/userManagement";
import { loadConfig } from "../../server/config";
import type { EmailMessage, EmailSender } from "../../server/email/mailer";
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
  it("sends the welcome email after invite signup", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);
    db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 1);
    const sentEmails: EmailMessage[] = [];
    const app = createApp({
      db,
      config: { ...loadConfig(), appBaseUrl: "https://followthrough.test" },
      emailSender: {
        async send(message) {
          sentEmails.push(message);
        },
      },
    });

    const response = await request(app).post("/api/auth/signup").send({
      name: "Avery Stone",
      email: "avery@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });

    expect(response.status).toBe(201);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: "avery@example.com",
      subject: "Followthrough: Welcome to your new account",
    });
    expect(sentEmails[0].html).toContain("Hi Avery,");
  });

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

  it("rate limits repeated login failures without revealing account existence", async () => {
    const app = appWithInvite();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({
        email: "missing@example.com",
        password: "wrong-password",
      });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Email or password is incorrect" });
    }

    const limited = await request(app).post("/api/auth/login").send({
      email: "MISSING@example.com",
      password: "wrong-password",
    });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: "Too many authentication attempts. Try again later.",
    });
    expect(limited.headers["ratelimit"]).toBeDefined();
  });

  it("changes the signed-in user's password", async () => {
    const app = appWithInvite();

    const signup = await request(app).post("/api/auth/signup").send({
      name: "Casey",
      email: "casey@example.com",
      password: "long-enough-password",
      inviteCode: "join-team",
    });

    const changePassword = await request(app)
      .post("/api/me/password")
      .set("Cookie", signup.headers["set-cookie"])
      .send({
        currentPassword: "long-enough-password",
        newPassword: "new-long-password",
      });

    expect(changePassword.status).toBe(204);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "casey@example.com",
      password: "long-enough-password",
    });
    expect(oldLogin.status).toBe(400);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: "casey@example.com",
      password: "new-long-password",
    });
    expect(newLogin.status).toBe(200);
  });

  it("rejects a password change with the wrong current password", async () => {
    const app = appWithInvite();

    const signup = await request(app).post("/api/auth/signup").send({
      name: "Casey",
      email: "casey@example.com",
      password: "long-enough-password",
      inviteCode: "join-team",
    });

    const changePassword = await request(app)
      .post("/api/me/password")
      .set("Cookie", signup.headers["set-cookie"])
      .send({
        currentPassword: "wrong-password",
        newPassword: "new-long-password",
      });

    expect(changePassword.status).toBe(400);
    expect(changePassword.body.error).toBe("Current password is incorrect");
  });

  it("sends a password reset link and lets the user set a new password", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);
    const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
    const emailSender: EmailSender = {
      async send(message) {
        sentEmails.push(message);
      },
    };
    const app = createApp({
      db,
      emailSender,
      config: {
        ...loadConfig(),
        appBaseUrl: "https://followthrough.test",
      },
    });

    await createUser(db, {
      name: "Locked User",
      email: "locked@example.com",
      password: "old-long-password",
      role: "member",
    });

    const requestReset = await request(app).post("/api/auth/password-reset/request").send({
      email: "locked@example.com",
    });

    expect(requestReset.status).toBe(200);
    expect(requestReset.body).toEqual({ ok: true });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].subject).toBe("Followthrough: Reset your password");
    const resetUrl = sentEmails[0].text.match(/https:\/\/followthrough\.test\/\?resetToken=([a-f0-9]+)#access/);
    expect(resetUrl).not.toBeNull();

    const confirm = await request(app).post("/api/auth/password-reset/confirm").send({
      token: resetUrl?.[1],
      newPassword: "new-long-password",
    });
    expect(confirm.status).toBe(204);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "locked@example.com",
      password: "old-long-password",
    });
    expect(oldLogin.status).toBe(400);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: "locked@example.com",
      password: "new-long-password",
    });
    expect(newLogin.status).toBe(200);
  });

  it("does not reveal whether a password reset email exists", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);
    const sentEmails: unknown[] = [];
    const app = createApp({
      db,
      emailSender: {
        async send(message) {
          sentEmails.push(message);
        },
      },
    });

    const response = await request(app).post("/api/auth/password-reset/request").send({
      email: "missing@example.com",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(sentEmails).toEqual([]);
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

  it("reserves owner access for philippe@beaudette.me", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    await expect(
      createUser(db, {
        name: "Not Philippe",
        email: "not-philippe@example.com",
        password: "long-enough-password",
        role: "owner",
      }),
    ).rejects.toThrow("Owner access is reserved for philippe@beaudette.me");

    const user = await createUser(db, {
      name: "Philippe",
      email: "philippe@beaudette.me",
      password: "long-enough-password",
      role: "owner",
    });

    expect(user.role).toBe("owner");
  });
});
