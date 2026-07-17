import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const app = createApp({ db, config: { ...loadConfig(), sessionTtlDays: 3650 } });
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
    .send({ name: "Taylor", email: "" });
  await request(app).post("/api/tasks").set("Cookie", cookie).send({
    description: "Prepare board packet",
    blockers: "Waiting on finance figures",
    notes: "Vendor packet revision is underway.",
    assigneePublicId: person.body.person.publicId,
    status: "Open",
    dueDate: "2026-06-10",
  });
  await request(app)
    .post("/api/meetings")
    .set("Cookie", cookie)
    .send({
      title: "Board Prep",
      startsAt: "2026-06-09T15:00:00.000Z",
      meetingType: "single",
      summary: "Packet timing.",
      blockers: "Need chair approval",
      notes: "Roadmap agenda notes.",
      links: [
        {
          label: "Board agenda",
          url: "https://example.com/board-agenda",
          linkType: "agenda",
        },
      ],
      attendeePublicIds: [person.body.person.publicId],
      taskPublicIds: ["T001"],
    });
  await request(app).post("/api/decisions").set("Cookie", cookie).send({
    decisionText: "Send packet Friday",
    decisionDate: "2026-06-09",
    context: "Enough review time.",
    meetingPublicId: "M001",
  });
  return { app, cookie, db, personPublicId: person.body.person.publicId };
}

afterEach(() => {
  vi.useRealTimers();
  for (const db of dbs.splice(0)) db.close();
});

describe("search and dashboard", () => {
  it("searches by exact public ID first", async () => {
    const { app, cookie } = await setup();

    const response = await request(app).get("/api/search?q=T001").set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      type: "task",
      publicId: "T001",
    });
  });

  it("searches text across records", async () => {
    const { app, cookie } = await setup();

    const response = await request(app).get("/api/search?q=packet").set("Cookie", cookie);

    expect(response.body.results.map((result: { type: string }) => result.type)).toEqual(
      expect.arrayContaining(["task", "meeting", "decision"]),
    );
  });

  it("searches meeting notes and structured links", async () => {
    const { app, cookie } = await setup();

    const notesResponse = await request(app).get("/api/search?q=Roadmap").set("Cookie", cookie);
    const linkResponse = await request(app).get("/api/search?q=board-agenda").set("Cookie", cookie);

    expect(notesResponse.body.results).toEqual([
      expect.objectContaining({ type: "meeting", publicId: "M001" }),
    ]);
    expect(linkResponse.body.results).toEqual([
      expect.objectContaining({ type: "meeting", publicId: "M001" }),
    ]);
  });

  it("searches task and meeting blockers", async () => {
    const { app, cookie } = await setup();

    const taskResponse = await request(app).get("/api/search?q=finance figures").set("Cookie", cookie);
    const meetingResponse = await request(app).get("/api/search?q=chair approval").set("Cookie", cookie);

    expect(taskResponse.body.results).toEqual([
      expect.objectContaining({ type: "task", publicId: "T001" }),
    ]);
    expect(meetingResponse.body.results).toEqual([
      expect.objectContaining({ type: "meeting", publicId: "M001" }),
    ]);
  });

  it("searches task progress notes", async () => {
    const { app, cookie } = await setup();

    const response = await request(app).get("/api/search?q=vendor packet").set("Cookie", cookie);

    expect(response.body.results).toEqual([
      expect.objectContaining({ type: "task", publicId: "T001" }),
    ]);
  });

  it("returns dashboard summaries and alerts", async () => {
    const { app, cookie, db } = await setup();
    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Close launch checklist",
      status: "Done",
      dueDate: "2026-06-08",
    });
    db.prepare("UPDATE tasks SET updated_at = ? WHERE public_id = ?").run(
      "2026-06-09T12:00:00.000Z",
      "T002",
    );

    const response = await request(app).get("/api/dashboard").set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.alerts.dueSoon).toHaveLength(1);
    expect(response.body.activeBlockers.tasks[0]).toEqual(
      expect.objectContaining({
        publicId: "T001",
        blockers: "Waiting on finance figures",
        blockersClearedAt: null,
      }),
    );
    expect(response.body.activeBlockers.meetings[0]).toEqual(
      expect.objectContaining({
        publicId: "M001",
        blockers: "Need chair approval",
        blockersClearedAt: null,
      }),
    );
    expect(response.body.openTasksByAssignee[0].assignee.name).toBe("Taylor");
    expect(response.body.recentDecisions[0].publicId).toBe("D001");
    expect(response.body.trends).toEqual({
      tasksCompletedThisWeek: 1,
      tasksCompletedThisMonth: 1,
      decisionsMadeThisMonth: 1,
      meetingsHeldThisMonth: 1,
    });
  });

  it("exports a markdown workspace summary", async () => {
    const { app, cookie } = await setup();

    const response = await request(app)
      .get("/api/dashboard/export?format=markdown")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/markdown");
    expect(response.text).toContain("# Followthrough weekly digest");
    expect(response.text).toContain("## Open tasks");
    expect(response.text).toContain("T001: Prepare board packet");
    expect(response.text).toContain("D001: Send packet Friday");
  });

  it("excludes another user's private tasks and meetings from search and dashboard", async () => {
    const { app, cookie, personPublicId } = await setup();
    const viewerSignup = await request(app).post("/api/auth/signup").send({
      name: "Viewer",
      email: "viewer@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });
    const viewerCookie = viewerSignup.headers["set-cookie"];

    await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Private packet",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-10",
      private: true,
    });
    await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Private packet review",
        startsAt: "2026-06-10T15:00:00.000Z",
        meetingType: "single",
        summary: "Private packet timing.",
        attendeePublicIds: [personPublicId],
        taskPublicIds: [],
        private: true,
      });

    const ownerSearch = await request(app).get("/api/search?q=Private").set("Cookie", cookie);
    expect(ownerSearch.body.results.map((result: { publicId: string }) => result.publicId)).toEqual(
      expect.arrayContaining(["T002", "M002"]),
    );

    const viewerSearch = await request(app).get("/api/search?q=Private").set("Cookie", viewerCookie);
    expect(viewerSearch.body.results).toEqual([]);

    const ownerDashboard = await request(app).get("/api/dashboard").set("Cookie", cookie);
    expect(ownerDashboard.body.alerts.dueSoon).toHaveLength(2);
    expect(
      ownerDashboard.body.recentMeetings.map((meeting: { publicId: string }) => meeting.publicId),
    ).toContain("M002");

    const viewerDashboard = await request(app).get("/api/dashboard").set("Cookie", viewerCookie);
    expect(viewerDashboard.body.alerts.dueSoon).toHaveLength(1);
    expect(
      viewerDashboard.body.recentMeetings.map((meeting: { publicId: string }) => meeting.publicId),
    ).not.toContain("M002");
  });
});
