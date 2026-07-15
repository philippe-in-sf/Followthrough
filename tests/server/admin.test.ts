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

  it("lets admins list recent waitlist signups", async () => {
    const { app, db, adminCookie } = await setup();
    db.prepare(
      "INSERT INTO waitlist_signups (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(
      "Older Signup",
      "older@example.com",
      "2026-06-28T10:00:00.000Z",
      "2026-06-28T10:00:00.000Z",
    );
    db.prepare(
      "INSERT INTO waitlist_signups (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(
      "Newest Signup",
      "newest@example.com",
      "2026-06-29T10:00:00.000Z",
      "2026-06-29T10:00:00.000Z",
    );

    const response = await request(app).get("/api/admin/waitlist").set("Cookie", adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.signups).toEqual([
      {
        id: 2,
        name: "Newest Signup",
        email: "newest@example.com",
        createdAt: "2026-06-29T10:00:00.000Z",
        updatedAt: "2026-06-29T10:00:00.000Z",
        handledAt: null,
        handledByUserId: null,
        handledByName: null,
        handledAction: null,
        inviteCode: null,
        createdUserId: null,
      },
      {
        id: 1,
        name: "Older Signup",
        email: "older@example.com",
        createdAt: "2026-06-28T10:00:00.000Z",
        updatedAt: "2026-06-28T10:00:00.000Z",
        handledAt: null,
        handledByUserId: null,
        handledByName: null,
        handledAction: null,
        inviteCode: null,
        createdUserId: null,
      },
    ]);
  });

  it("lets admins create an invite code from a waitlist signup and mark it handled", async () => {
    const { app, db, adminCookie } = await setup();
    const signup = db
      .prepare("INSERT INTO waitlist_signups (name, email) VALUES (?, ?)")
      .run("Morgan Lee", "morgan@example.com");
    const signupId = Number(signup.lastInsertRowid);

    const response = await request(app)
      .post(`/api/admin/waitlist/${signupId}/invite-code`)
      .set("Cookie", adminCookie)
      .send({ code: "morgan-invite", role: "member" });

    expect(response.status).toBe(201);
    expect(response.body.inviteCode).toEqual({
      id: 2,
      code: "morgan-invite",
      usageLimit: 1,
      defaultRole: "member",
    });
    expect(response.body.signup).toMatchObject({
      id: signupId,
      name: "Morgan Lee",
      email: "morgan@example.com",
      handledByUserId: 1,
      handledByName: "Admin",
      handledAction: "invite_code",
      inviteCode: "morgan-invite",
      createdUserId: null,
    });
    expect(response.body.signup.handledAt).toEqual(expect.any(String));

    const savedInvite = db
      .prepare(
        "SELECT code, label, usage_limit, usage_count, team_id, default_role FROM invite_codes WHERE code = ?",
      )
      .get("morgan-invite") as {
      code: string;
      label: string;
      usage_limit: number;
      usage_count: number;
      team_id: number;
      default_role: string;
    };
    expect(savedInvite).toEqual({
      code: "morgan-invite",
      label: "Waitlist: Morgan Lee <morgan@example.com>",
      usage_limit: 1,
      usage_count: 0,
      team_id: 1,
      default_role: "member",
    });
  });

  it("lets admins create a direct user from a waitlist signup and mark it handled", async () => {
    const { app, db, adminCookie } = await setup();
    const signup = db
      .prepare("INSERT INTO waitlist_signups (name, email) VALUES (?, ?)")
      .run("Riley Chen", "riley@example.com");
    const signupId = Number(signup.lastInsertRowid);

    const response = await request(app)
      .post(`/api/admin/waitlist/${signupId}/direct-user`)
      .set("Cookie", adminCookie)
      .send({ password: "long-enough-password", role: "admin" });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: "Riley Chen",
      email: "riley@example.com",
      role: "admin",
      teamId: 1,
    });
    expect(response.body.signup).toMatchObject({
      id: signupId,
      handledByUserId: 1,
      handledByName: "Admin",
      handledAction: "direct_user",
      inviteCode: null,
      createdUserId: response.body.user.id,
    });
    expect(response.body.signup.handledAt).toEqual(expect.any(String));

    const login = await request(app).post("/api/auth/login").send({
      email: "riley@example.com",
      password: "long-enough-password",
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("admin");
  });

  it("rejects handling a waitlist signup twice", async () => {
    const { app, db, adminCookie } = await setup();
    const signup = db
      .prepare("INSERT INTO waitlist_signups (name, email) VALUES (?, ?)")
      .run("Casey Park", "casey@example.com");
    const signupId = Number(signup.lastInsertRowid);

    const first = await request(app)
      .post(`/api/admin/waitlist/${signupId}/invite-code`)
      .set("Cookie", adminCookie)
      .send({ code: "casey-invite", role: "member" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/admin/waitlist/${signupId}/direct-user`)
      .set("Cookie", adminCookie)
      .send({ password: "long-enough-password", role: "member" });

    expect(second.status).toBe(400);
    expect(second.body.error).toBe("Waitlist signup is already handled");
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

  it("scopes admin users and login events to their team unless the user has owner access", async () => {
    const { app, db, adminCookie } = await setup();
    const otherTeam = db.prepare("INSERT INTO teams (name) VALUES (?)").run("Other Team");
    const otherTeamId = Number(otherTeam.lastInsertRowid);
    await createUser(db, {
      name: "Other Admin",
      email: "other@example.com",
      password: "long-enough-password",
      role: "admin",
      teamId: otherTeamId,
    });
    await createUser(db, {
      name: "Philippe",
      email: "philippe@beaudette.me",
      password: "long-enough-password",
      role: "owner",
      teamId: 1,
    });

    await request(app).post("/api/auth/login").send({
      email: "other@example.com",
      password: "long-enough-password",
    });
    const ownerLogin = await request(app).post("/api/auth/login").send({
      email: "philippe@beaudette.me",
      password: "long-enough-password",
    });

    const adminUsers = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    expect(adminUsers.body.users.map((user: { email: string }) => user.email)).not.toContain(
      "other@example.com",
    );

    const adminLogins = await request(app).get("/api/admin/login-events").set("Cookie", adminCookie);
    expect(
      adminLogins.body.loginEvents.map((event: { userEmail: string }) => event.userEmail),
    ).not.toContain("other@example.com");

    const ownerUsers = await request(app).get("/api/admin/users").set("Cookie", ownerLogin.headers["set-cookie"]);
    expect(ownerUsers.body.users.map((user: { email: string }) => user.email)).toEqual(
      expect.arrayContaining(["admin@example.com", "member@example.com", "other@example.com"]),
    );

    const ownerLogins = await request(app)
      .get("/api/admin/login-events")
      .set("Cookie", ownerLogin.headers["set-cookie"]);
    expect(ownerLogins.body.loginEvents.map((event: { userEmail: string }) => event.userEmail)).toEqual(
      expect.arrayContaining(["admin@example.com", "member@example.com", "other@example.com"]),
    );
  });

  it("lets admins impersonate visible members and return to their admin session", async () => {
    const { app, adminCookie } = await setup();

    const users = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    const member = users.body.users.find(
      (user: { email: string }) => user.email === "member@example.com",
    );

    const started = await request(app)
      .post(`/api/admin/users/${member.id}/impersonate`)
      .set("Cookie", adminCookie);

    expect(started.status).toBe(200);
    expect(started.body.user).toMatchObject({
      id: member.id,
      email: "member@example.com",
      role: "member",
      impersonation: {
        actor: {
          email: "admin@example.com",
          role: "admin",
        },
      },
    });

    const me = await request(app).get("/api/auth/me").set("Cookie", adminCookie);
    expect(me.body.user).toMatchObject({
      email: "member@example.com",
      role: "member",
      impersonation: {
        actor: {
          email: "admin@example.com",
        },
      },
    });

    const adminDuringImpersonation = await request(app)
      .get("/api/admin/team")
      .set("Cookie", adminCookie);
    expect(adminDuringImpersonation.status).toBe(403);

    const writeDuringImpersonation = await request(app)
      .post("/api/tasks")
      .set("Cookie", adminCookie)
      .send({ description: "Accidental impersonated write", status: "Open" });
    expect(writeDuringImpersonation.status).toBe(403);
    expect(writeDuringImpersonation.body.error).toBe("Stop viewing as user before making changes");

    const stopped = await request(app)
      .post("/api/auth/impersonation/stop")
      .set("Cookie", adminCookie);

    expect(stopped.status).toBe(200);
    expect(stopped.body.user).toMatchObject({
      email: "admin@example.com",
      role: "admin",
      impersonation: null,
    });

    const adminAfterStop = await request(app).get("/api/admin/team").set("Cookie", adminCookie);
    expect(adminAfterStop.status).toBe(200);
  });

  it("rejects impersonating admins or users outside the admin's visible team", async () => {
    const { app, db, adminCookie } = await setup();
    const secondAdmin = await createUser(db, {
      name: "Second Admin",
      email: "second-admin@example.com",
      password: "long-enough-password",
      role: "admin",
      teamId: 1,
    });
    const otherTeam = db.prepare("INSERT INTO teams (name) VALUES (?)").run("Other Team");
    const otherTeamId = Number(otherTeam.lastInsertRowid);
    const otherMember = await createUser(db, {
      name: "Other Member",
      email: "other-member@example.com",
      password: "long-enough-password",
      role: "member",
      teamId: otherTeamId,
    });

    const adminTarget = await request(app)
      .post(`/api/admin/users/${secondAdmin.id}/impersonate`)
      .set("Cookie", adminCookie);
    expect(adminTarget.status).toBe(400);
    expect(adminTarget.body.error).toBe("Only members can be impersonated");

    const outsideTeam = await request(app)
      .post(`/api/admin/users/${otherMember.id}/impersonate`)
      .set("Cookie", adminCookie);
    expect(outsideTeam.status).toBe(404);
  });

  it("lets admins reset a team user's password and revoke old sessions", async () => {
    const { app, adminCookie, memberCookie } = await setup();

    const users = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    const member = users.body.users.find(
      (user: { email: string }) => user.email === "member@example.com",
    );

    const reset = await request(app)
      .post(`/api/admin/users/${member.id}/password`)
      .set("Cookie", adminCookie)
      .send({ password: "reset-long-password" });

    expect(reset.status).toBe(204);

    const oldSession = await request(app).get("/api/tasks").set("Cookie", memberCookie);
    expect(oldSession.status).toBe(401);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "member@example.com",
      password: "long-enough-password",
    });
    expect(oldLogin.status).toBe(400);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: "member@example.com",
      password: "reset-long-password",
    });
    expect(newLogin.status).toBe(200);
  });

  it("lets admins remove users from the team and protects old team records", async () => {
    const { app, adminCookie, memberCookie } = await setup();

    const person = await request(app)
      .post("/api/people")
      .set("Cookie", adminCookie)
      .send({ name: "Avery", email: "avery@example.com" });
    await request(app).post("/api/tasks").set("Cookie", adminCookie).send({
      description: "Shared team task",
      assigneePublicId: person.body.person.publicId,
      status: "Open",
    });
    await request(app).post("/api/meetings").set("Cookie", adminCookie).send({
      title: "Shared team meeting",
      startsAt: "2026-06-29T17:00:00.000Z",
      meetingType: "single",
      attendeePublicIds: [person.body.person.publicId],
      taskPublicIds: [],
    });
    await request(app).post("/api/decisions").set("Cookie", adminCookie).send({
      decisionText: "Keep records team-scoped",
      decisionDate: "2026-06-29",
      context: "Offboarding",
    });

    const users = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    const member = users.body.users.find(
      (user: { email: string }) => user.email === "member@example.com",
    );

    const removed = await request(app)
      .post(`/api/admin/users/${member.id}/remove`)
      .set("Cookie", adminCookie);

    expect(removed.status).toBe(200);
    expect(removed.body.user).toMatchObject({
      id: member.id,
      email: "member@example.com",
      role: "admin",
    });
    expect(removed.body.user.teamId).not.toBe(1);

    const oldSession = await request(app).get("/api/tasks").set("Cookie", memberCookie);
    expect(oldSession.status).toBe(401);

    const memberLogin = await request(app).post("/api/auth/login").send({
      email: "member@example.com",
      password: "long-enough-password",
    });
    expect(memberLogin.status).toBe(200);
    expect(memberLogin.body.user.team.id).toBe(removed.body.user.teamId);

    const memberTasks = await request(app)
      .get("/api/tasks")
      .set("Cookie", memberLogin.headers["set-cookie"]);
    const memberMeetings = await request(app)
      .get("/api/meetings")
      .set("Cookie", memberLogin.headers["set-cookie"]);
    const memberDecisions = await request(app)
      .get("/api/decisions")
      .set("Cookie", memberLogin.headers["set-cookie"]);

    expect(memberTasks.body.tasks).toEqual([]);
    expect(memberMeetings.body.meetings).toEqual([]);
    expect(memberDecisions.body.decisions).toEqual([]);

    const adminTasks = await request(app).get("/api/tasks").set("Cookie", adminCookie);
    const adminMeetings = await request(app).get("/api/meetings").set("Cookie", adminCookie);
    const adminDecisions = await request(app).get("/api/decisions").set("Cookie", adminCookie);

    expect(adminTasks.body.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
    ]);
    expect(adminMeetings.body.meetings.map((meeting: { publicId: string }) => meeting.publicId)).toEqual([
      "M001",
    ]);
    expect(
      adminDecisions.body.decisions.map((decision: { publicId: string }) => decision.publicId),
    ).toEqual(["D001"]);
  });

  it("lets members leave a team without carrying team records with them", async () => {
    const { app, adminCookie, memberCookie } = await setup();

    await request(app).post("/api/people").set("Cookie", adminCookie).send({ name: "Avery" });
    await request(app).post("/api/tasks").set("Cookie", adminCookie).send({
      description: "Old team task",
      status: "Open",
    });
    await request(app).post("/api/meetings").set("Cookie", adminCookie).send({
      title: "Old team meeting",
      startsAt: "2026-06-29T17:00:00.000Z",
      meetingType: "single",
      attendeePublicIds: [],
      taskPublicIds: [],
    });
    await request(app).post("/api/decisions").set("Cookie", adminCookie).send({
      decisionText: "Old team decision",
      decisionDate: "2026-06-29",
      context: "Offboarding",
    });

    const left = await request(app).post("/api/me/team/leave").set("Cookie", memberCookie);

    expect(left.status).toBe(200);
    expect(left.body.user).toMatchObject({
      email: "member@example.com",
      role: "admin",
    });
    expect(left.body.user.team.id).not.toBe(1);

    const tasks = await request(app).get("/api/tasks").set("Cookie", memberCookie);
    const meetings = await request(app).get("/api/meetings").set("Cookie", memberCookie);
    const decisions = await request(app).get("/api/decisions").set("Cookie", memberCookie);

    expect(tasks.body.tasks).toEqual([]);
    expect(meetings.body.meetings).toEqual([]);
    expect(decisions.body.decisions).toEqual([]);
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

  it("prevents the last admin from leaving the team", async () => {
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
      .post("/api/me/team/leave")
      .set("Cookie", login.headers["set-cookie"]);

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
