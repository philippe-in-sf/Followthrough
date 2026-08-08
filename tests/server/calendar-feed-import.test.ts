import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig, type AppConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];
const feedEncryptionKey = Buffer.alloc(32, 13).toString("base64");

const baseConfig: AppConfig = {
  ...loadConfig(),
  databasePath: ":memory:",
  nodeEnv: "test",
  appBaseUrl: "http://localhost:3000",
  calendarFeedEncryptionKey: feedEncryptionKey,
  calendarFeedEncryptionPreviousKeys: [],
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

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of dbs.splice(0)) db.close();
});

describe("iCalendar feed import", () => {
  it("stores a per-user feed URL as ciphertext and returns status only", async () => {
    const { app, cookie, db } = await setup();

    const initial = await request(app)
      .get("/api/calendar-feed/connection")
      .set("Cookie", cookie);
    expect(initial.body).toEqual({ available: true, configured: false });

    const saved = await request(app)
      .put("/api/calendar-feed/connection")
      .set("Cookie", cookie)
      .send({ feedUrl: "webcal://8.8.8.8/private/team.ics#ignored" });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ available: true, configured: true });
    expect(JSON.stringify(saved.body)).not.toContain("team.ics");

    const row = db
      .prepare(
        "SELECT feed_url_ciphertext FROM calendar_feed_connections WHERE user_id = ?",
      )
      .get(1) as { feed_url_ciphertext: string };
    expect(row.feed_url_ciphertext).toMatch(/^enc:v1:/);
    expect(row.feed_url_ciphertext).not.toContain("team.ics");
  });

  it("imports matching one-time and recurring events without OAuth", async () => {
    const { app, cookie } = await setup();
    await request(app)
      .put("/api/calendar-feed/connection")
      .set("Cookie", cookie)
      .send({ feedUrl: "https://8.8.8.8/private/team.ics" });

    const planningStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    planningStart.setUTCMilliseconds(0);
    const standupStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    standupStart.setUTCMilliseconds(0);
    const toIcalDate = (date: Date) =>
      date.toISOString().replace(/[-:]/g, "").replace(".000", "");
    const source = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Followthrough Test//EN",
      "BEGIN:VEVENT",
      "UID:planning-1",
      `DTSTAMP:${toIcalDate(new Date())}`,
      `DTSTART:${toIcalDate(planningStart)}`,
      "SUMMARY:Project planning",
      "DESCRIPTION:Agenda and owners https://meet.google.com/abc-defg-hij",
      "LOCATION:Conference Room 2",
      "ATTENDEE;CN=Morgan Lane:mailto:morgan@example.com",
      "ATTENDEE:mailto:taylor@example.com",
      "URL:https://calendar.example.com/events/planning-1",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:standup-1",
      `DTSTAMP:${toIcalDate(new Date())}`,
      `DTSTART:${toIcalDate(standupStart)}`,
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "SUMMARY:Operations standup",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(source, {
          status: 200,
          headers: { "Content-Type": "text/calendar" },
        }),
      ),
    );

    const planning = await request(app)
      .get("/api/calendar-feed/events?query=planning")
      .set("Cookie", cookie);

    expect(planning.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://8.8.8.8/private/team.ics"),
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(planning.body.events).toEqual([
      {
        id: `planning-1:${planningStart.toISOString()}`,
        title: "Project planning",
        startsAt: planningStart.toISOString(),
        timePrecision: "datetime",
        summary: "Conference Room 2",
        notes: "Agenda and owners https://meet.google.com/abc-defg-hij",
        attendeeNames: "Morgan Lane, taylor@example.com",
        links: [
          {
            label: "Calendar event",
            url: "https://calendar.example.com/events/planning-1",
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

    const recurring = await request(app)
      .get("/api/calendar-feed/events?query=standup")
      .set("Cookie", cookie);
    expect(recurring.body.events.map((event: { startsAt: string }) => event.startsAt)).toEqual([
      standupStart.toISOString(),
      new Date(standupStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(standupStart.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    ]);
  });

  it("blocks feeds that resolve to private network targets", async () => {
    const { app, cookie } = await setup();
    await request(app)
      .put("/api/calendar-feed/connection")
      .set("Cookie", cookie)
      .send({ feedUrl: "https://127.0.0.1/private.ics" });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await request(app)
      .get("/api/calendar-feed/events")
      .set("Cookie", cookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Calendar feed URL must resolve to a public internet address.",
    );

    await request(app)
      .put("/api/calendar-feed/connection")
      .set("Cookie", cookie)
      .send({ feedUrl: "https://[::ffff:7f00:1]/private.ics" });
    const mappedResponse = await request(app)
      .get("/api/calendar-feed/events")
      .set("Cookie", cookie);
    expect(mappedResponse.status).toBe(400);
    expect(mappedResponse.body.error).toBe(
      "Calendar feed URL must resolve to a public internet address.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes only the signed-in user's feed connection", async () => {
    const { app, cookie, db } = await setup();
    await request(app)
      .put("/api/calendar-feed/connection")
      .set("Cookie", cookie)
      .send({ feedUrl: "https://8.8.8.8/private/team.ics" });

    const response = await request(app)
      .delete("/api/calendar-feed/connection")
      .set("Cookie", cookie);

    expect(response.status).toBe(204);
    expect(
      db
        .prepare("SELECT user_id FROM calendar_feed_connections WHERE user_id = ?")
        .get(1),
    ).toBeUndefined();
  });
});
