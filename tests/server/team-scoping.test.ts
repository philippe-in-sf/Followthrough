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
  db.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").run(2, "Other Team");
  const app = createApp({ db });

  await createUser(db, {
    name: "Team One Admin",
    email: "one@example.com",
    password: "long-enough-password",
    role: "admin",
    teamId: 1,
  });
  await createUser(db, {
    name: "Team Two Admin",
    email: "two@example.com",
    password: "long-enough-password",
    role: "admin",
    teamId: 2,
  });

  const teamOneLogin = await request(app).post("/api/auth/login").send({
    email: "one@example.com",
    password: "long-enough-password",
  });
  const teamTwoLogin = await request(app).post("/api/auth/login").send({
    email: "two@example.com",
    password: "long-enough-password",
  });

  return {
    app,
    db,
    teamOneCookie: teamOneLogin.headers["set-cookie"],
    teamTwoCookie: teamTwoLogin.headers["set-cookie"],
  };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("team scoping", () => {
  it("keeps people, tasks, meetings, decisions, search, and dashboard scoped to the signed-in team", async () => {
    const { app, teamOneCookie, teamTwoCookie } = await setup();

    const teamOnePerson = await request(app)
      .post("/api/people")
      .set("Cookie", teamOneCookie)
      .send({ name: "Avery Team One", email: "" });
    await request(app)
      .post("/api/people")
      .set("Cookie", teamTwoCookie)
      .send({ name: "Morgan Team Two", email: "" });

    await request(app).post("/api/tasks").set("Cookie", teamOneCookie).send({
      description: "Team one task",
      assigneePublicId: teamOnePerson.body.person.publicId,
      status: "Open",
      dueDate: "2026-06-30",
    });
    await request(app).post("/api/tasks").set("Cookie", teamTwoCookie).send({
      description: "Team two task",
      status: "Open",
      dueDate: "2026-06-30",
    });

    await request(app).post("/api/meetings").set("Cookie", teamOneCookie).send({
      title: "Team one meeting",
      startsAt: "2026-06-30T15:00:00.000Z",
      meetingType: "single",
      summary: "",
      attendeePublicIds: [teamOnePerson.body.person.publicId],
      taskPublicIds: ["T001"],
    });
    await request(app).post("/api/meetings").set("Cookie", teamTwoCookie).send({
      title: "Team two meeting",
      startsAt: "2026-06-30T16:00:00.000Z",
      meetingType: "single",
      summary: "",
      attendeePublicIds: [],
      taskPublicIds: [],
    });

    await request(app).post("/api/decisions").set("Cookie", teamOneCookie).send({
      decisionText: "Team one decision",
      decisionDate: "2026-06-30",
      context: "",
      meetingPublicId: "M001",
    });
    await request(app).post("/api/decisions").set("Cookie", teamTwoCookie).send({
      decisionText: "Team two decision",
      decisionDate: "2026-06-30",
      context: "",
      meetingPublicId: "M002",
    });

    const people = await request(app).get("/api/people").set("Cookie", teamOneCookie);
    expect(people.body.people.map((person: { name: string }) => person.name)).toEqual([
      "Avery Team One",
    ]);

    const tasks = await request(app).get("/api/tasks").set("Cookie", teamOneCookie);
    expect(tasks.body.tasks.map((task: { description: string }) => task.description)).toEqual([
      "Team one task",
    ]);

    const meetings = await request(app).get("/api/meetings").set("Cookie", teamOneCookie);
    expect(meetings.body.meetings.map((meeting: { title: string }) => meeting.title)).toEqual([
      "Team one meeting",
    ]);

    const decisions = await request(app).get("/api/decisions").set("Cookie", teamOneCookie);
    expect(
      decisions.body.decisions.map((decision: { decisionText: string }) => decision.decisionText),
    ).toEqual(["Team one decision"]);

    const search = await request(app).get("/api/search?q=Team two").set("Cookie", teamOneCookie);
    expect(search.body.results).toEqual([]);

    const dashboard = await request(app).get("/api/dashboard").set("Cookie", teamOneCookie);
    expect(
      dashboard.body.openTasksByAssignee.flatMap((group: { tasks: Array<{ description: string }> }) =>
        group.tasks.map((task) => task.description),
      ),
    ).toEqual(["Team one task"]);
  });

  it("rejects cross-team related public IDs", async () => {
    const { app, teamOneCookie, teamTwoCookie } = await setup();

    const teamOnePerson = await request(app)
      .post("/api/people")
      .set("Cookie", teamOneCookie)
      .send({ name: "Avery Team One", email: "" });
    await request(app).post("/api/tasks").set("Cookie", teamOneCookie).send({
      description: "Team one task",
      assigneePublicId: teamOnePerson.body.person.publicId,
      status: "Open",
      dueDate: "2026-06-30",
    });
    await request(app).post("/api/meetings").set("Cookie", teamOneCookie).send({
      title: "Team one meeting",
      startsAt: "2026-06-30T15:00:00.000Z",
      meetingType: "single",
      summary: "",
      attendeePublicIds: [teamOnePerson.body.person.publicId],
      taskPublicIds: ["T001"],
    });

    const task = await request(app).post("/api/tasks").set("Cookie", teamTwoCookie).send({
      description: "Illegal task",
      assigneePublicId: teamOnePerson.body.person.publicId,
      status: "Open",
      dueDate: "2026-06-30",
    });
    expect(task.status).toBe(400);
    expect(task.body.error).toBe("Assignee not found");

    const meeting = await request(app).post("/api/meetings").set("Cookie", teamTwoCookie).send({
      title: "Illegal meeting",
      startsAt: "2026-06-30T16:00:00.000Z",
      meetingType: "single",
      summary: "",
      attendeePublicIds: [teamOnePerson.body.person.publicId],
      taskPublicIds: ["T001"],
    });
    expect(meeting.status).toBe(400);
    expect(meeting.body.error).toBe(`Person not found: ${teamOnePerson.body.person.publicId}`);

    const decision = await request(app).post("/api/decisions").set("Cookie", teamTwoCookie).send({
      decisionText: "Illegal decision",
      decisionDate: "2026-06-30",
      context: "",
      meetingPublicId: "M001",
    });
    expect(decision.status).toBe(400);
    expect(decision.body.error).toBe("Meeting not found");
  });
});
