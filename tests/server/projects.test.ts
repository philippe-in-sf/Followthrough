import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";
import { flattenProjectNotes } from "../../server/projects/store";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup(projectsEnabled = true) {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const app = createApp({ db, config: { ...loadConfig(), projectsEnabled } });
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Project Editor",
    email: "projects@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });
  return { app, cookie: signup.headers["set-cookie"], db };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("project-centered workspace", () => {
  it("keeps general notes intact while rolling multi-project notes, tasks, and decisions up", async () => {
    const { app, cookie, db } = await setup();
    const website = await request(app)
      .post("/api/projects")
      .set("Cookie", cookie)
      .send({ name: "Website Relaunch", description: "Ship the new site" });
    const hiring = await request(app)
      .post("/api/projects")
      .set("Cookie", cookie)
      .send({ name: "Hiring", status: "active" });

    expect(website.status).toBe(201);
    expect(hiring.status).toBe(201);
    expect(website.body.project.publicId).toBe("J001");

    const meeting = await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Weekly operations",
        startsAt: "2026-08-08T12:00:00.000Z",
        timePrecision: "date",
        meetingType: "single",
        summary: "",
        notes: "General notes remain exactly here.",
        attendeePublicIds: [],
        taskPublicIds: [],
        projectPublicIds: ["J001", "J002"],
      });

    expect(meeting.status).toBe(201);
    expect(meeting.body.meeting.timePrecision).toBe("date");
    expect(meeting.body.meeting.projects.map((project: { publicId: string }) => project.publicId)).toEqual([
      "J002",
      "J001",
    ]);

    const note = await request(app)
      .post("/api/meetings/M001/project-notes")
      .set("Cookie", cookie)
      .send({
        body: "Launch timing depends on the final hire.",
        noteType: "decision",
        projectPublicIds: ["J001", "J002"],
      });
    expect(note.status).toBe(201);
    expect(note.body.note.publicId).toBe("N001");
    expect(note.body.note.projects).toHaveLength(2);

    const classicNotes = await request(app)
      .get("/api/me/meeting-notes?range=custom&startDate=2026-08-08&endDate=2026-08-08")
      .set("Cookie", cookie);
    expect(classicNotes.status).toBe(200);
    expect(classicNotes.body.notes[0].projectNotes[0].body).toBe(
      "Launch timing depends on the final hire.",
    );

    const task = await request(app)
      .post("/api/tasks")
      .set("Cookie", cookie)
      .send({
        description: "Confirm launch owner",
        status: "Open",
        originMeetingPublicId: "M001",
      });
    expect(task.status).toBe(201);

    const decision = await request(app)
      .post("/api/decisions")
      .set("Cookie", cookie)
      .send({
        decisionText: "Keep the launch date flexible",
        decisionDate: "2026-08-08",
        context: "Hiring dependency",
        meetingPublicId: "M001",
      });
    expect(decision.status).toBe(201);

    const detail = await request(app).get("/api/projects/J001").set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.project).toEqual(
      expect.objectContaining({
        meetingCount: 1,
        noteCount: 1,
        taskCount: 1,
        decisionCount: 1,
      }),
    );
    expect(detail.body.project.notes[0]).toEqual(
      expect.objectContaining({ body: "Launch timing depends on the final hire." }),
    );
    expect(detail.body.project.tasks[0].description).toBe("Confirm launch owner");
    expect(detail.body.project.decisions[0].decisionText).toBe(
      "Keep the launch date flexible",
    );

    const storedBeforeFlatten = db
      .prepare("SELECT notes FROM meetings WHERE public_id = 'M001'")
      .get() as { notes: string };
    expect(storedBeforeFlatten.notes).toBe("General notes remain exactly here.");

    expect(flattenProjectNotes(db)).toEqual({ notesFlattened: 1, meetingsChanged: 1 });
    expect(flattenProjectNotes(db)).toEqual({ notesFlattened: 0, meetingsChanged: 0 });
    const storedAfterFlatten = db
      .prepare("SELECT notes FROM meetings WHERE public_id = 'M001'")
      .get() as { notes: string };
    expect(storedAfterFlatten.notes).toContain("General notes remain exactly here.");
    expect(storedAfterFlatten.notes.match(/followthrough-project-note:N001/g)).toHaveLength(1);

    const exported = await request(app)
      .get("/api/projects/export?format=markdown")
      .set("Cookie", cookie);
    expect(exported.status).toBe(200);
    expect(exported.text).toContain("# Website Relaunch");
    expect(exported.text).toContain("Launch timing depends on the final hire.");
  });

  it("keeps project data dormant when the deployment switch is off", async () => {
    const { app, cookie } = await setup(false);

    const preferences = await request(app).get("/api/me/preferences").set("Cookie", cookie);
    expect(preferences.body.projectsEnabled).toBe(false);

    const projects = await request(app).get("/api/projects").set("Cookie", cookie);
    expect(projects.status).toBe(404);
    expect(projects.body.error).toBe("Projects are disabled");
  });

  it("does not expose private project activity counts or notes to another user", async () => {
    const { app, cookie } = await setup();
    const secondSignup = await request(app).post("/api/auth/signup").send({
      name: "Second User",
      email: "second-projects@example.com",
      password: "long-enough-password",
      inviteCode: "join",
    });
    const secondCookie = secondSignup.headers["set-cookie"];

    await request(app)
      .post("/api/projects")
      .set("Cookie", cookie)
      .send({ name: "Private launch" });
    await request(app)
      .post("/api/meetings")
      .set("Cookie", cookie)
      .send({
        title: "Private planning",
        startsAt: "2026-08-08T12:00:00.000Z",
        timePrecision: "date",
        meetingType: "single",
        summary: "",
        notes: "",
        attendeePublicIds: [],
        taskPublicIds: [],
        projectPublicIds: ["J001"],
        private: true,
      });
    await request(app)
      .post("/api/meetings/M001/project-notes")
      .set("Cookie", cookie)
      .send({ body: "Private launch note", projectPublicIds: ["J001"] });

    const list = await request(app).get("/api/projects").set("Cookie", secondCookie);
    expect(list.body.projects[0]).toEqual(
      expect.objectContaining({ meetingCount: 0, noteCount: 0 }),
    );
    const detail = await request(app).get("/api/projects/J001").set("Cookie", secondCookie);
    expect(detail.body.project.meetings).toEqual([]);
    expect(detail.body.project.notes).toEqual([]);
  });
});
