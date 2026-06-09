import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const app = createApp({ db });
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });
  const cookie = signup.headers["set-cookie"];
  const person = await request(app)
    .post("/api/people")
    .set("Cookie", cookie)
    .send({ name: "Morgan", email: "" });
  return { app, cookie, personPublicId: person.body.person.publicId };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("meetings", () => {
  it("creates a single meeting with attendees", async () => {
    const { app, cookie, personPublicId } = await setup();

    const meeting = await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Planning",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "Discussed launch work.",
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    expect(meeting.status).toBe(201);
    expect(meeting.body.meeting.publicId).toBe("M001");
    expect(meeting.body.meeting.attendees[0].publicId).toBe(personPublicId);
  });

  it("creates next recurring occurrence and carries open tasks", async () => {
    const { app, cookie, personPublicId } = await setup();

    const series = await request(app)
      .post("/api/meeting-series")
      .set("Cookie", cookie)
      .send({
        title: "Weekly Ops",
        cadenceLabel: "Weekly",
        active: true,
      });

    const firstMeeting = await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Weekly Ops",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "recurring",
        seriesPublicId: series.body.series.publicId,
        summary: "First instance.",
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Prepare follow-up",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-16",
      originMeetingPublicId: firstMeeting.body.meeting.publicId,
    });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Already complete",
      assigneePublicId: personPublicId,
      status: "Done",
      dueDate: "2026-06-16",
      originMeetingPublicId: firstMeeting.body.meeting.publicId,
    });

    const next = await request(app)
      .post(`/api/meeting-series/${series.body.series.publicId}/occurrences`)
      .set("Cookie", cookie)
      .send({
        startsAt: "2026-06-16T15:00:00.000Z",
        summary: "Second instance.",
        attendeePublicIds: [personPublicId],
      });

    expect(next.status).toBe(201);
    expect(next.body.meeting.publicId).toBe("M002");
    expect(next.body.meeting.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
    ]);
  });
});
