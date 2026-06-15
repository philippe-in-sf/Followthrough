import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
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
    .send({ name: "Taylor", email: "" });
  await request(app).post("/api/tasks").set("Cookie", cookie).send({
    description: "Prepare board packet",
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
  return { app, cookie, personPublicId: person.body.person.publicId };
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

  it("returns dashboard summaries and alerts", async () => {
    const { app, cookie } = await setup();

    const response = await request(app).get("/api/dashboard").set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.alerts.dueSoon).toHaveLength(1);
    expect(response.body.openTasksByAssignee[0].assignee.name).toBe("Taylor");
    expect(response.body.recentDecisions[0].publicId).toBe("D001");
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
