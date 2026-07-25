import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createUser } from "../../server/auth/userManagement";
import { loadConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

/**
 * #3 — privileged actions (impersonation start/stop, role changes, admin
 * password resets) must produce durable audit records, and those records must
 * be visible to the right admins (own team) and to the owner (all teams).
 */

const APP_BASE_URL = "https://followthrough.test";
const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").run(2, "Other Team");
  const app = createApp({ db, config: { ...loadConfig(), appBaseUrl: APP_BASE_URL } });

  await createUser(db, {
    name: "Owner",
    email: "philippe@beaudette.me",
    password: "long-enough-password",
    role: "owner",
    teamId: 1,
  });
  await createUser(db, {
    name: "Team One Admin",
    email: "admin@example.com",
    password: "long-enough-password",
    role: "admin",
    teamId: 1,
  });
  await createUser(db, {
    name: "Team One Member",
    email: "member@example.com",
    password: "long-enough-password",
    role: "member",
    teamId: 1,
  });
  await createUser(db, {
    name: "Team Two Admin",
    email: "two-admin@example.com",
    password: "long-enough-password",
    role: "admin",
    teamId: 2,
  });

  return {
    app,
    db,
    owner: await login(app, "philippe@beaudette.me"),
    admin: await login(app, "admin@example.com"),
    teamTwoAdmin: await login(app, "two-admin@example.com"),
    memberId: userId(db, "member@example.com"),
  };
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "long-enough-password" });
  const cookie = response.headers["set-cookie"];
  if (!cookie) throw new Error(`Login failed for ${email}: ${response.status}`);
  return cookie as unknown as string[];
}

function userId(db: ReturnType<typeof createTestDatabase>, email: string) {
  return (db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("admin audit — role change", () => {
  it("records a role change with before/after roles", async () => {
    const ctx = await setup();

    const change = await request(ctx.app)
      .patch(`/api/admin/users/${ctx.memberId}/role`)
      .set("Cookie", ctx.admin)
      .send({ role: "admin" });
    expect(change.status).toBe(200);

    const audit = await request(ctx.app).get("/api/admin/admin-audit").set("Cookie", ctx.admin);
    expect(audit.status).toBe(200);
    const events = audit.body.events;
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("user.role_changed");
    expect(events[0].actorEmail).toBe("admin@example.com");
    expect(events[0].targetEmail).toBe("member@example.com");
    expect(events[0].metadata).toEqual({ from: "member", to: "admin" });
  });
});

describe("admin audit — password reset", () => {
  it("records an admin-initiated password reset", async () => {
    const ctx = await setup();

    const reset = await request(ctx.app)
      .post(`/api/admin/users/${ctx.memberId}/password`)
      .set("Cookie", ctx.admin)
      .send({ password: "another-long-password" });
    expect(reset.status).toBe(204);

    const audit = await request(ctx.app).get("/api/admin/admin-audit").set("Cookie", ctx.admin);
    const events = audit.body.events;
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("user.password_reset");
    expect(events[0].targetEmail).toBe("member@example.com");
  });
});

describe("admin audit — impersonation", () => {
  it("records both start and stop of an impersonation session", async () => {
    const ctx = await setup();

    const start = await request(ctx.app)
      .post(`/api/admin/users/${ctx.memberId}/impersonate`)
      .set("Cookie", ctx.admin)
      .send({});
    expect(start.status).toBe(200);
    // Impersonation rotates the session token, so later requests must carry
    // the cookie returned by the previous response.
    const impersonating = (start.headers["set-cookie"] as unknown as string[]) ?? ctx.admin;

    const stop = await request(ctx.app)
      .post("/api/auth/impersonation/stop")
      .set("Cookie", impersonating)
      .send({});
    expect(stop.status).toBe(200);
    const afterStop = (stop.headers["set-cookie"] as unknown as string[]) ?? impersonating;

    const audit = await request(ctx.app).get("/api/admin/admin-audit").set("Cookie", afterStop);
    const actions = audit.body.events.map((event: { action: string }) => event.action);
    // Most recent first.
    expect(actions).toEqual(["impersonation.stop", "impersonation.start"]);

    const startEvent = audit.body.events.find(
      (event: { action: string }) => event.action === "impersonation.start",
    );
    expect(startEvent.actorEmail).toBe("admin@example.com");
    expect(startEvent.targetEmail).toBe("member@example.com");
  });

  it("does not record a stop when no impersonation was active", async () => {
    const ctx = await setup();

    const stop = await request(ctx.app)
      .post("/api/auth/impersonation/stop")
      .set("Cookie", ctx.admin)
      .send({});
    expect(stop.status).toBe(200);
    // Stopping also rotates the token even when nothing was impersonated.
    const afterStop = (stop.headers["set-cookie"] as unknown as string[]) ?? ctx.admin;

    const audit = await request(ctx.app).get("/api/admin/admin-audit").set("Cookie", afterStop);
    expect(audit.body.events).toEqual([]);
  });
});

describe("admin audit — visibility", () => {
  it("scopes an admin to their own team's events but shows the owner everything", async () => {
    const ctx = await setup();

    // Team one admin changes a team one member's role.
    await request(ctx.app)
      .patch(`/api/admin/users/${ctx.memberId}/role`)
      .set("Cookie", ctx.admin)
      .send({ role: "admin" });

    // Team two admin sees none of team one's events.
    const teamTwoView = await request(ctx.app)
      .get("/api/admin/admin-audit")
      .set("Cookie", ctx.teamTwoAdmin);
    expect(teamTwoView.body.events).toEqual([]);

    // Owner sees all teams' events.
    const ownerView = await request(ctx.app)
      .get("/api/admin/admin-audit")
      .set("Cookie", ctx.owner);
    expect(ownerView.body.events.length).toBeGreaterThanOrEqual(1);
  });

  it("forbids a member from reading the admin audit log", async () => {
    const ctx = await setup();
    const memberCookie = await login(ctx.app, "member@example.com");

    const response = await request(ctx.app)
      .get("/api/admin/admin-audit")
      .set("Cookie", memberCookie);
    expect(response.status).toBe(403);
  });
});
