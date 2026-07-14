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
  const app = createApp({ db });

  await createUser(db, {
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    role: "admin",
    teamId: 1,
  });
  await createUser(db, {
    name: "Teammate",
    email: "teammate@example.com",
    password: "long-enough-password",
    role: "member",
    teamId: 1,
  });

  const editorLogin = await request(app).post("/api/auth/login").send({
    email: "editor@example.com",
    password: "long-enough-password",
  });
  const teammateLogin = await request(app).post("/api/auth/login").send({
    email: "teammate@example.com",
    password: "long-enough-password",
  });

  const editorPerson = await request(app)
    .post("/api/people")
    .set("Cookie", editorLogin.headers["set-cookie"])
    .send({ name: "Editor Person", email: "editor@example.com" });
  const teammatePerson = await request(app)
    .post("/api/people")
    .set("Cookie", editorLogin.headers["set-cookie"])
    .send({ name: "Teammate Person", email: "teammate@example.com" });

  return {
    app,
    db,
    editorCookie: editorLogin.headers["set-cookie"],
    teammateCookie: teammateLogin.headers["set-cookie"],
    editorPersonPublicId: editorPerson.body.person.publicId as string,
    teammatePersonPublicId: teammatePerson.body.person.publicId as string,
  };
}

async function createMeeting(
  app: ReturnType<typeof createApp>,
  cookie: string[],
  body: {
    title: string;
    startsAt: string;
    notes: string;
    attendeePublicIds?: string[];
    private?: boolean;
  },
) {
  return request(app)
    .post("/api/meetings")
    .set("Cookie", cookie)
    .send({
      title: body.title,
      startsAt: body.startsAt,
      meetingType: "single",
      summary: "",
      notes: body.notes,
      attendeePublicIds: body.attendeePublicIds ?? [],
      taskPublicIds: [],
      private: body.private ?? false,
    });
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("meeting notes", () => {
  it("lists notes from meetings created by or attended by the signed-in user", async () => {
    const { app, editorCookie, teammateCookie, editorPersonPublicId, teammatePersonPublicId } =
      await setup();

    await createMeeting(app, editorCookie, {
      title: "Created by editor",
      startsAt: "2026-07-13T15:00:00.000Z",
      notes: "Created note",
      attendeePublicIds: [teammatePersonPublicId],
    });
    await createMeeting(app, teammateCookie, {
      title: "Editor attended",
      startsAt: "2026-07-12T15:00:00.000Z",
      notes: "Attended note",
      attendeePublicIds: [editorPersonPublicId],
    });
    await createMeeting(app, editorCookie, {
      title: "Both match once",
      startsAt: "2026-07-11T15:00:00.000Z",
      notes: "Both note",
      attendeePublicIds: [editorPersonPublicId],
    });

    const response = await request(app)
      .get("/api/me/meeting-notes?range=week&now=2026-07-14T00:00:00.000Z")
      .set("Cookie", editorCookie);

    expect(response.status).toBe(200);
    expect(response.body.notes.map((note: { title: string }) => note.title)).toEqual([
      "Created by editor",
      "Editor attended",
      "Both match once",
    ]);
    expect(response.body.notes).toHaveLength(3);
    expect(response.body.notes[0]).toEqual(
      expect.objectContaining({
        publicId: "M001",
        notes: "Created note",
        matchReasons: ["creator"],
      }),
    );
    expect(response.body.notes[1].matchReasons).toEqual(["attendee"]);
    expect(response.body.notes[2].matchReasons).toEqual(["creator", "attendee"]);
  });

  it("filters by day, week, month, and custom date ranges", async () => {
    const { app, editorCookie } = await setup();

    await createMeeting(app, editorCookie, {
      title: "Day",
      startsAt: "2026-07-13T15:00:00.000Z",
      notes: "Day note",
    });
    await createMeeting(app, editorCookie, {
      title: "Week",
      startsAt: "2026-07-10T15:00:00.000Z",
      notes: "Week note",
    });
    await createMeeting(app, editorCookie, {
      title: "Month",
      startsAt: "2026-06-20T15:00:00.000Z",
      notes: "Month note",
    });
    await createMeeting(app, editorCookie, {
      title: "Old",
      startsAt: "2026-05-01T15:00:00.000Z",
      notes: "Old note",
    });

    const day = await request(app)
      .get("/api/me/meeting-notes?range=day&now=2026-07-14T00:00:00.000Z")
      .set("Cookie", editorCookie);
    expect(day.body.notes.map((note: { title: string }) => note.title)).toEqual(["Day"]);

    const week = await request(app)
      .get("/api/me/meeting-notes?range=week&now=2026-07-14T00:00:00.000Z")
      .set("Cookie", editorCookie);
    expect(week.body.notes.map((note: { title: string }) => note.title)).toEqual(["Day", "Week"]);

    const month = await request(app)
      .get("/api/me/meeting-notes?range=month&now=2026-07-14T00:00:00.000Z")
      .set("Cookie", editorCookie);
    expect(month.body.notes.map((note: { title: string }) => note.title)).toEqual([
      "Day",
      "Week",
      "Month",
    ]);

    const custom = await request(app)
      .get("/api/me/meeting-notes?range=custom&startDate=2026-06-01&endDate=2026-06-30")
      .set("Cookie", editorCookie);
    expect(custom.body.notes.map((note: { title: string }) => note.title)).toEqual(["Month"]);
  });

  it("excludes archived meetings, blank notes, other-team records, archived attendee people, and inaccessible private notes", async () => {
    const { app, db, editorCookie, teammateCookie, editorPersonPublicId } = await setup();
    db.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").run(2, "Other Team");
    await createUser(db, {
      name: "Other Team",
      email: "other@example.com",
      password: "long-enough-password",
      role: "admin",
      teamId: 2,
    });
    const otherLogin = await request(app).post("/api/auth/login").send({
      email: "other@example.com",
      password: "long-enough-password",
    });
    const otherTeamEditorPerson = await request(app)
      .post("/api/people")
      .set("Cookie", otherLogin.headers["set-cookie"])
      .send({ name: "Other Team Editor", email: "editor@example.com" });

    await createMeeting(app, editorCookie, {
      title: "Visible but archived",
      startsAt: "2026-07-13T15:00:00.000Z",
      notes: "Visible note",
    });
    await createMeeting(app, editorCookie, {
      title: "Blank",
      startsAt: "2026-07-13T14:00:00.000Z",
      notes: "   ",
    });
    await createMeeting(app, teammateCookie, {
      title: "Private teammate",
      startsAt: "2026-07-13T13:00:00.000Z",
      notes: "Private note",
      attendeePublicIds: [editorPersonPublicId],
      private: true,
    });
    await createMeeting(app, teammateCookie, {
      title: "Archived attendee person",
      startsAt: "2026-07-13T12:00:00.000Z",
      notes: "Archived attendee note",
      attendeePublicIds: [editorPersonPublicId],
    });
    await createMeeting(app, otherLogin.headers["set-cookie"], {
      title: "Other team",
      startsAt: "2026-07-13T11:00:00.000Z",
      notes: "Other team note",
      attendeePublicIds: [otherTeamEditorPerson.body.person.publicId],
    });
    await request(app).post("/api/meetings/M001/archive").set("Cookie", editorCookie);
    db.prepare("UPDATE people SET archived_at = CURRENT_TIMESTAMP WHERE public_id = ?").run(
      editorPersonPublicId,
    );

    const response = await request(app)
      .get("/api/me/meeting-notes?range=month&now=2026-07-14T00:00:00.000Z")
      .set("Cookie", editorCookie);

    expect(response.status).toBe(200);
    expect(response.body.notes).toEqual([]);
  });

  it("rejects invalid custom date ranges", async () => {
    const { app, editorCookie } = await setup();

    const response = await request(app)
      .get("/api/me/meeting-notes?range=custom&startDate=2026-07-31&endDate=2026-07-01")
      .set("Cookie", editorCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Start date must be before end date");
  });
});
