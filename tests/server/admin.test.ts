import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createUser } from "../../server/auth/userManagement";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const app = createApp({ db });

  await createUser(db, {
    name: "Admin",
    email: "admin@example.com",
    password: "long-enough-password",
    role: "admin",
  });
  const adminLogin = await request(app).post("/api/auth/login").send({
    email: "admin@example.com",
    password: "long-enough-password",
  });

  const memberSignup = await request(app).post("/api/auth/signup").send({
    name: "Member",
    email: "member@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });

  return {
    app,
    db,
    adminCookie: adminLogin.headers["set-cookie"],
    memberCookie: memberSignup.headers["set-cookie"],
  };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("admin API", () => {
  it("lets admins read and update team settings", async () => {
    const { app, adminCookie } = await setup();

    const initial = await request(app).get("/api/admin/team").set("Cookie", adminCookie);
    expect(initial.status).toBe(200);
    expect(initial.body.team).toEqual({
      id: 1,
      name: "Default Team",
      logoUrl: null,
      workCalendarUrl: null,
    });

    const updated = await request(app)
      .put("/api/admin/team")
      .set("Cookie", adminCookie)
      .send({
        name: "Acme Ops",
        logoUrl: "https://example.com/logo.png",
        workCalendarUrl: "https://calendar.example.com/team",
      });

    expect(updated.status).toBe(200);
    expect(updated.body.team).toEqual({
      id: 1,
      name: "Acme Ops",
      logoUrl: "https://example.com/logo.png",
      workCalendarUrl: "https://calendar.example.com/team",
    });
  });

  it("rejects member access to admin routes", async () => {
    const { app, memberCookie } = await setup();

    const response = await request(app).get("/api/admin/team").set("Cookie", memberCookie);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Admin access required");
  });

  it("lets admins add team users with a selected role", async () => {
    const { app, adminCookie } = await setup();

    const created = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({
        name: "Second Admin",
        email: "second@example.com",
        password: "long-enough-password",
        role: "admin",
      });

    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({
      name: "Second Admin",
      email: "second@example.com",
      role: "admin",
      teamId: 1,
    });

    const login = await request(app).post("/api/auth/login").send({
      email: "second@example.com",
      password: "long-enough-password",
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("admin");
  });

  it("lets admins change another user's role", async () => {
    const { app, adminCookie } = await setup();

    const users = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    const member = users.body.users.find(
      (user: { email: string }) => user.email === "member@example.com",
    );

    const updated = await request(app)
      .patch(`/api/admin/users/${member.id}/role`)
      .set("Cookie", adminCookie)
      .send({ role: "admin" });

    expect(updated.status).toBe(200);
    expect(updated.body.user).toMatchObject({
      id: member.id,
      email: "member@example.com",
      role: "admin",
    });
  });

  it("prevents demoting the last admin in a team", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);
    const app = createApp({ db });

    await createUser(db, {
      name: "Only Admin",
      email: "only@example.com",
      password: "long-enough-password",
      role: "admin",
    });
    const login = await request(app).post("/api/auth/login").send({
      email: "only@example.com",
      password: "long-enough-password",
    });

    const response = await request(app)
      .patch("/api/admin/users/1/role")
      .set("Cookie", login.headers["set-cookie"])
      .send({ role: "member" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("At least one admin is required");
  });

  it("rejects invalid team setting URLs without changing saved values", async () => {
    const { app, adminCookie } = await setup();

    await request(app)
      .put("/api/admin/team")
      .set("Cookie", adminCookie)
      .send({
        name: "Acme Ops",
        logoUrl: "https://example.com/logo.png",
        workCalendarUrl: "https://calendar.example.com/team",
      });

    const response = await request(app)
      .put("/api/admin/team")
      .set("Cookie", adminCookie)
      .send({
        name: "Acme Ops",
        logoUrl: "javascript:alert(1)",
        workCalendarUrl: "https://calendar.example.com/changed",
      });

    expect(response.status).toBe(400);

    const saved = await request(app).get("/api/admin/team").set("Cookie", adminCookie);
    expect(saved.body.team).toMatchObject({
      logoUrl: "https://example.com/logo.png",
      workCalendarUrl: "https://calendar.example.com/team",
    });
  });
});
