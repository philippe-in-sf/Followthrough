import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig, type AppConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

const baseConfig: AppConfig = {
  ...loadConfig(),
  databasePath: ":memory:",
  nodeEnv: "test",
  appBaseUrl: "http://localhost:3000",
  googleOAuthRedirectUri: "http://localhost:3000/api/google-calendar/oauth/callback",
};

async function setup(config: Partial<AppConfig> = {}) {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const app = createApp({ db, config: { ...baseConfig, ...config } });
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });

  return { app, cookie: signup.headers["set-cookie"], db };
}

async function signupUser(app: ReturnType<typeof createApp>, email: string, name: string) {
  const signup = await request(app).post("/api/auth/signup").send({
    name,
    email,
    password: "long-enough-password",
    inviteCode: "join",
  });

  return signup.headers["set-cookie"];
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("user preferences", () => {
  it("returns default preferences for the signed-in user", async () => {
    const { app, cookie } = await setup();

    const response = await request(app).get("/api/me/preferences").set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workCalendarUrl: null,
      googleOAuthRedirectUri: "http://localhost:3000/api/google-calendar/oauth/callback",
    });
  });

  it("saves a valid work calendar URL", async () => {
    const { app, cookie } = await setup();

    const response = await request(app)
      .put("/api/me/preferences")
      .set("Cookie", cookie)
      .send({ workCalendarUrl: " https://calendar.google.com/calendar/u/0/r/week " });

    expect(response.status).toBe(200);
    expect(response.body.workCalendarUrl).toBe(
      "https://calendar.google.com/calendar/u/0/r/week",
    );

    const saved = await request(app).get("/api/me/preferences").set("Cookie", cookie);
    expect(saved.body.workCalendarUrl).toBe("https://calendar.google.com/calendar/u/0/r/week");
  });

  it("clears the work calendar URL", async () => {
    const { app, cookie } = await setup();
    await request(app)
      .put("/api/me/preferences")
      .set("Cookie", cookie)
      .send({ workCalendarUrl: "https://calendar.example.com/team" });

    const response = await request(app)
      .put("/api/me/preferences")
      .set("Cookie", cookie)
      .send({ workCalendarUrl: null });

    expect(response.status).toBe(200);
    expect(response.body.workCalendarUrl).toBeNull();
  });

  it("rejects malformed and non-web work calendar URLs without changing the saved value", async () => {
    const { app, cookie } = await setup();
    await request(app)
      .put("/api/me/preferences")
      .set("Cookie", cookie)
      .send({ workCalendarUrl: "https://calendar.example.com/team" });

    const response = await request(app)
      .put("/api/me/preferences")
      .set("Cookie", cookie)
      .send({ workCalendarUrl: "javascript:alert(1)" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Enter a valid http or https calendar URL.");

    const saved = await request(app).get("/api/me/preferences").set("Cookie", cookie);
    expect(saved.body.workCalendarUrl).toBe("https://calendar.example.com/team");
  });

  it("keeps work calendar URLs isolated by signed-in user", async () => {
    const { app, cookie: editorCookie } = await setup();
    const viewerCookie = await signupUser(app, "viewer@example.com", "Viewer");

    await request(app)
      .put("/api/me/preferences")
      .set("Cookie", editorCookie)
      .send({ workCalendarUrl: "https://calendar.example.com/editor" });
    await request(app)
      .put("/api/me/preferences")
      .set("Cookie", viewerCookie)
      .send({ workCalendarUrl: "https://calendar.example.com/viewer" });

    const editorPreferences = await request(app)
      .get("/api/me/preferences")
      .set("Cookie", editorCookie);
    const viewerPreferences = await request(app)
      .get("/api/me/preferences")
      .set("Cookie", viewerCookie);

    expect(editorPreferences.body.workCalendarUrl).toBe("https://calendar.example.com/editor");
    expect(viewerPreferences.body.workCalendarUrl).toBe("https://calendar.example.com/viewer");
  });
});
