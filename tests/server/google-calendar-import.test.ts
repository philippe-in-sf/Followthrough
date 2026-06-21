import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import type { AppConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

const baseConfig: AppConfig = {
  port: 3000,
  databasePath: ":memory:",
  sessionCookieName: "tm_session",
  sessionTtlDays: 14,
  dueSoonDays: 7,
  appBaseUrl: "http://localhost:3000",
  taskReminderEmailFrom: "",
  taskReminderAutoEnabled: false,
  taskReminderAutoIntervalMs: 86_400_000,
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  nodeEnv: "test",
  googleCalendarId: "",
  googleCalendarApiKey: "",
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
  return { app, cookie: signup.headers["set-cookie"] };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of dbs.splice(0)) db.close();
});

describe("google calendar import", () => {
  it("reports missing Google Calendar configuration", async () => {
    const { app, cookie } = await setup();

    const response = await request(app)
      .get("/api/google-calendar/events?query=planning")
      .set("Cookie", cookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Google Calendar import is not configured");
  });

  it("maps Google Calendar events to meeting import candidates", async () => {
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
    const { app, cookie } = await setup({
      googleCalendarId: "team@example.com",
      googleCalendarApiKey: "test-key",
    });

    const response = await request(app)
      .get("/api/google-calendar/events?query=planning")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("calendars/team%40example.com/events"),
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("q=planning"));
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
});
