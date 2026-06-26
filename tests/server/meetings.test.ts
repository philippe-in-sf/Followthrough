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
        blockers: "Waiting on launch owner",
        notes: "Keep these notes.",
        links: [
          {
            label: "Planning agenda",
            url: "https://example.com/planning-agenda",
            linkType: "agenda",
          },
        ],
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    expect(meeting.status).toBe(201);
    expect(meeting.body.meeting.publicId).toBe("M001");
    expect(meeting.body.meeting.blockers).toBe("Waiting on launch owner");
    expect(meeting.body.meeting.blockersClearedAt).toBeNull();
    expect(meeting.body.meeting.attendees[0].publicId).toBe(personPublicId);

    const cleared = await request(app)
      .patch("/api/meetings/M001")
      .set("Cookie", cookie)
      .send({
        title: "Planning",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "Discussed launch work.",
        blockersCleared: true,
        notes: "Keep these notes.",
        links: [
          {
            label: "Planning agenda",
            url: "https://example.com/planning-agenda",
            linkType: "agenda",
          },
        ],
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    expect(cleared.body.meeting.blockers).toBe("Waiting on launch owner");
    expect(cleared.body.meeting.blockersClearedAt).toEqual(expect.any(String));

    const archived = await request(app).post("/api/meetings/M001/archive").set("Cookie", cookie);
    expect(archived.status).toBe(204);

    const activeAfterArchive = await request(app).get("/api/meetings").set("Cookie", cookie);
    expect(
      activeAfterArchive.body.meetings.map((item: { publicId: string }) => item.publicId),
    ).not.toContain("M001");

    const archivedList = await request(app)
      .get("/api/meetings?archived=true")
      .set("Cookie", cookie);
    expect(archivedList.body.meetings).toEqual([
      expect.objectContaining({ publicId: "M001", archived: true }),
    ]);

    const archivedAudit = await request(app).get("/api/meetings/M001/audit").set("Cookie", cookie);
    expect(archivedAudit.status).toBe(200);

    const restored = await request(app).post("/api/meetings/M001/restore").set("Cookie", cookie);
    expect(restored.status).toBe(200);
    expect(restored.body.meeting).toEqual(
      expect.objectContaining({ publicId: "M001", archived: false }),
    );

    const activeAfterRestore = await request(app).get("/api/meetings").set("Cookie", cookie);
    expect(
      activeAfterRestore.body.meetings.map((item: { publicId: string }) => item.publicId),
    ).toContain("M001");
  });

  it("records meeting audit history", async () => {
    const { app, cookie, personPublicId } = await setup();

    await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Planning",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "Discussed launch work.",
        blockers: "Need product sign-off",
        notes: "Keep these notes.",
        links: [
          {
            label: "Planning agenda",
            url: "https://example.com/planning-agenda",
            linkType: "agenda",
          },
        ],
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    await request(app)
      .patch("/api/meetings/M001")
      .set("Cookie", cookie)
      .send({
        title: "Updated planning",
        startsAt: "2026-06-09T15:30:00.000Z",
        meetingType: "single",
        summary: "Updated launch work.",
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    const audit = await request(app).get("/api/meetings/M001/audit").set("Cookie", cookie);

    expect(audit.status).toBe(200);
    expect(audit.body.auditEvents).toEqual([
      expect.objectContaining({
        action: "updated",
        actorName: "Editor",
        entityPublicId: "M001",
        entityType: "meeting",
        summary: "Updated meeting details",
      }),
      expect.objectContaining({
        action: "created",
        actorName: "Editor",
        summary: "Created meeting",
      }),
    ]);
    expect(audit.body.auditEvents[0].changes.after.title).toBe("Updated planning");

    const updatedMeeting = await request(app).get("/api/meetings/M001").set("Cookie", cookie);
    expect(updatedMeeting.body.meeting.blockers).toBe("Need product sign-off");
    expect(updatedMeeting.body.meeting.blockersClearedAt).toBeNull();
    expect(updatedMeeting.body.meeting.notes).toBe("Keep these notes.");
    expect(updatedMeeting.body.meeting.links).toEqual([
      expect.objectContaining({
        label: "Planning agenda",
        url: "https://example.com/planning-agenda",
        linkType: "agenda",
      }),
    ]);
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
        notes: "First notes.",
        links: [
          {
            label: "Standing agenda",
            url: "https://example.com/agenda",
            linkType: "agenda",
          },
        ],
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

    const selectedTask = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Bring metrics dashboard",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-16",
    });

    const next = await request(app)
      .post(`/api/meeting-series/${series.body.series.publicId}/occurrences`)
      .set("Cookie", cookie)
      .send({
        startsAt: "2026-06-16T15:00:00.000Z",
        summary: "Second instance.",
        notes: "Second notes.",
        links: [
          {
            label: "Follow-up deck",
            url: "https://example.com/deck",
            linkType: "work",
          },
        ],
        attendeePublicIds: [personPublicId],
        taskPublicIds: [selectedTask.body.task.publicId],
      });

    expect(next.status).toBe(201);
    expect(next.body.meeting.publicId).toBe("M002");
    expect(next.body.meeting.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
      "T003",
    ]);
    expect(next.body.meeting.notes).toBe("First notes.\n\nSecond notes.");
    expect(next.body.meeting.links).toEqual([
      expect.objectContaining({
        label: "Standing agenda",
        url: "https://example.com/agenda",
        linkType: "agenda",
      }),
      expect.objectContaining({
        label: "Follow-up deck",
        url: "https://example.com/deck",
        linkType: "work",
      }),
    ]);
  });

  it("keeps private meetings visible only to their creator", async () => {
    const { app, cookie, personPublicId } = await setup();
    const viewerSignup = await request(app).post("/api/auth/signup").send({
      name: "Viewer",
      email: "viewer@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });
    const viewerCookie = viewerSignup.headers["set-cookie"];

    const meeting = await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Private planning",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "Sensitive work.",
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
        private: true,
      });

    expect(meeting.status).toBe(201);
    expect(meeting.body.meeting.private).toBe(true);

    const ownerList = await request(app).get("/api/meetings").set("Cookie", cookie);
    expect(
      ownerList.body.meetings.map((item: { publicId: string }) => item.publicId),
    ).toContain("M001");

    const viewerList = await request(app).get("/api/meetings").set("Cookie", viewerCookie);
    expect(
      viewerList.body.meetings.map((item: { publicId: string }) => item.publicId),
    ).not.toContain("M001");

    const viewerGet = await request(app).get("/api/meetings/M001").set("Cookie", viewerCookie);
    expect(viewerGet.status).toBe(404);
  });

  it("does not expose private linked tasks through public meetings", async () => {
    const { app, cookie, personPublicId } = await setup();
    const viewerSignup = await request(app).post("/api/auth/signup").send({
      name: "Viewer",
      email: "viewer@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });
    const viewerCookie = viewerSignup.headers["set-cookie"];

    await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Shared planning",
        startsAt: "2026-06-09T15:00:00.000Z",
        meetingType: "single",
        summary: "Visible meeting.",
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
      });

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Private follow-up",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-16",
      originMeetingPublicId: "M001",
      private: true,
    });

    const ownerMeeting = await request(app).get("/api/meetings/M001").set("Cookie", cookie);
    expect(ownerMeeting.body.meeting.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
    ]);

    const viewerMeeting = await request(app).get("/api/meetings/M001").set("Cookie", viewerCookie);
    expect(viewerMeeting.status).toBe(200);
    expect(viewerMeeting.body.meeting.tasks).toEqual([]);
  });
});
