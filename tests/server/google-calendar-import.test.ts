import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { getGoogleCalendarAccessToken } from "../../server/calendar/oauth";
import type { AppConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];
const tokenEncryptionKey = Buffer.alloc(32, 7).toString("base64");

const baseConfig: AppConfig = {
  port: 3000,
  databasePath: ":memory:",
  backupEnabled: false,
  backupDir: "data/backups",
  backupIntervalMs: 86_400_000,
  backupRetentionCount: 14,
  backupEncryptionKey: "",
  backupEncryptionPreviousKeys: [],
  authCleanupIntervalMs: 86_400_000,
  sessionCookieName: "tm_session",
  sessionTtlDays: 14,
  sessionIdleTimeoutMinutes: 1440,
  dueSoonDays: 7,
  appBaseUrl: "http://localhost:3000",
  taskReminderEmailFrom: "",
  taskReminderAutoEnabled: false,
  taskReminderAutoIntervalMs: 86_400_000,
  taskAutoArchiveAfterDays: 14,
  taskAutoArchiveIntervalMs: 86_400_000,
  workspaceDigestIntervalMs: 86_400_000,
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  nodeEnv: "test",
  googleOAuthClientId: "",
  googleOAuthClientSecret: "",
  googleOAuthRedirectUri: "",
  googleOAuthTokenEncryptionKey: tokenEncryptionKey,
  googleOAuthTokenEncryptionPreviousKeys: [],
  calendarFeedEncryptionKey: tokenEncryptionKey,
  calendarFeedEncryptionPreviousKeys: [],
};

const oauthConfig: Partial<AppConfig> = {
  googleOAuthClientId: "client-id.apps.googleusercontent.com",
  googleOAuthClientSecret: "client-secret",
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

function insertGoogleConnection(
  db: ReturnType<typeof createTestDatabase>,
  userId = 1,
  expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(),
) {
  db.prepare(
    `
      INSERT INTO google_calendar_connections (
        user_id,
        google_email,
        access_token,
        refresh_token,
        token_expires_at,
        scope
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    userId,
    "editor@gmail.com",
    "access-token",
    "refresh-token",
    expiresAt,
    "https://www.googleapis.com/auth/calendar.readonly",
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of dbs.splice(0)) db.close();
});

describe("google calendar import", () => {
  it("starts a user OAuth connection without asking for calendar IDs or API keys", async () => {
    const { app, cookie, db } = await setup(oauthConfig);

    const response = await request(app).get("/api/google-calendar/connect").set("Cookie", cookie);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe("client-id.apps.googleusercontent.com");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/google-calendar/oauth/callback",
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(location.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/calendar.readonly",
    );
    expect(location.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/userinfo.email",
    );
    expect(location.searchParams.get("state")).toBeTruthy();

    const savedState = db
      .prepare("SELECT user_id FROM google_oauth_states WHERE state = ?")
      .get(location.searchParams.get("state")) as { user_id: number } | undefined;
    expect(savedState?.user_id).toBe(1);
  });

  it("stores the connected Google account after OAuth callback", async () => {
    const { app, cookie, db } = await setup(oauthConfig);
    const connect = await request(app).get("/api/google-calendar/connect").set("Cookie", cookie);
    const state = new URL(connect.headers.location).searchParams.get("state");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        expect(String(init?.body)).toContain("grant_type=authorization_code");
        expect(String(init?.body)).toContain("code=oauth-code");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "new-access-token",
              refresh_token: "new-refresh-token",
              expires_in: 3600,
              scope:
                "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
              token_type: "Bearer",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "https://www.googleapis.com/oauth2/v2/userinfo") {
        expect(init?.headers).toEqual({ Authorization: "Bearer new-access-token" });
        return Promise.resolve(
          new Response(JSON.stringify({ email: "editor@gmail.com" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    });

    const callback = await request(app)
      .get(`/api/google-calendar/oauth/callback?code=oauth-code&state=${state}`)
      .set("Cookie", cookie);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("/?googleCalendar=connected");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const connection = db
      .prepare(
        "SELECT google_email, access_token, refresh_token FROM google_calendar_connections WHERE user_id = ?",
      )
      .get(1) as
      | { google_email: string; access_token: string; refresh_token: string }
      | undefined;
    expect(connection?.google_email).toBe("editor@gmail.com");
    expect(connection?.access_token).toMatch(/^enc:v1:/);
    expect(connection?.refresh_token).toMatch(/^enc:v1:/);
    expect(connection?.access_token).not.toContain("new-access-token");
    expect(connection?.refresh_token).not.toContain("new-refresh-token");
  });

  it("requires the signed-in user to connect Google Calendar before import", async () => {
    const { app, cookie } = await setup(oauthConfig);

    const response = await request(app)
      .get("/api/google-calendar/events?query=planning")
      .set("Cookie", cookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Connect Google Calendar before importing events.");
  });

  it("decrypts the refresh token and stores refreshed access tokens as ciphertext", async () => {
    const { db } = await setup(oauthConfig);
    insertGoogleConnection(db, 1, new Date(Date.now() - 60 * 1000).toISOString());
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "refreshed-access-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/calendar.readonly",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      getGoogleCalendarAccessToken(db, { ...baseConfig, ...oauthConfig }, 1),
    ).resolves.toBe("refreshed-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("refresh_token=refresh-token");

    const stored = db
      .prepare(
        "SELECT access_token, refresh_token FROM google_calendar_connections WHERE user_id = ?",
      )
      .get(1) as { access_token: string; refresh_token: string };
    expect(stored.access_token).toMatch(/^enc:v1:/);
    expect(stored.refresh_token).toMatch(/^enc:v1:/);
    expect(stored.access_token).not.toContain("refreshed-access-token");
    expect(stored.refresh_token).not.toContain("refresh-token");
  });

  it("maps connected user Google Calendar events to meeting import candidates", async () => {
    const { app, cookie, db } = await setup(oauthConfig);
    insertGoogleConnection(db);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "calendar-event-1",
              htmlLink: "https://calendar.google.com/event?eid=abc",
              summary: "Project planning",
              description: "Agenda: sequencing and owners",
              location: "Conference Room 2",
              start: { dateTime: "2026-06-22T15:00:00-05:00" },
              attendees: [
                { displayName: "Morgan Lane", email: "morgan@example.com" },
                { email: "taylor@example.com" },
              ],
              hangoutLink: "https://meet.google.com/abc-defg-hij",
              conferenceData: {
                entryPoints: [
                  { entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await request(app)
      .get("/api/google-calendar/events?query=planning")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("calendars/primary/events"),
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("q=planning"), {
      headers: { Authorization: "Bearer access-token" },
    });
    expect(response.body.events).toEqual([
      {
        id: "calendar-event-1",
        title: "Project planning",
        startsAt: "2026-06-22T20:00:00.000Z",
        summary: "Conference Room 2",
        notes: "Agenda: sequencing and owners",
        attendeeNames: "Morgan Lane, taylor@example.com",
        links: [
          {
            label: "Google Calendar event",
            url: "https://calendar.google.com/event?eid=abc",
            linkType: "reference",
          },
          {
            label: "Google Meet",
            url: "https://meet.google.com/abc-defg-hij",
            linkType: "work",
          },
        ],
      },
    ]);
  });

  it("disconnects the signed-in user's Google Calendar", async () => {
    const { app, cookie, db } = await setup(oauthConfig);
    insertGoogleConnection(db);

    const response = await request(app)
      .delete("/api/google-calendar/connection")
      .set("Cookie", cookie);

    expect(response.status).toBe(204);
    const row = db
      .prepare("SELECT user_id FROM google_calendar_connections WHERE user_id = ?")
      .get(1);
    expect(row).toBeUndefined();
  });
});
