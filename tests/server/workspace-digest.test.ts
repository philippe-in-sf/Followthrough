import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig } from "../../server/config";
import { sendWeeklyWorkspaceDigests } from "../../server/dashboard/digestJob";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";
import type { EmailMessage, EmailSender } from "../../server/email/mailer";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare("INSERT INTO invite_codes (code, usage_limit) VALUES (?, ?)").run("join", 10);
  const sentEmails: EmailMessage[] = [];
  const emailSender: EmailSender = {
    send: vi.fn(async (message) => {
      sentEmails.push(message);
    }),
  };
  const config = { ...loadConfig(), appBaseUrl: "https://followthrough.dev", sessionTtlDays: 3650 };
  const app = createApp({ db, config, emailSender });
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    inviteCode: "join",
  });
  const cookie = signup.headers["set-cookie"];
  await request(app).post("/api/tasks").set("Cookie", cookie).send({
    description: "Prepare weekly packet",
    status: "Open",
    dueDate: "2026-06-10",
  });
  sentEmails.length = 0;
  return { app, cookie, db, config, emailSender, sentEmails };
}

afterEach(() => {
  vi.useRealTimers();
  for (const db of dbs.splice(0)) db.close();
});

describe("weekly workspace digests", () => {
  it("does not send when the signed-in user has not opted in", async () => {
    const { db, config, emailSender, sentEmails } = await setup();

    const result = await sendWeeklyWorkspaceDigests(
      db,
      config,
      emailSender,
      new Date("2026-06-09T12:00:00Z"),
    );

    expect(result.sent).toEqual([]);
    expect(sentEmails).toEqual([]);
  });

  it("sends one weekly digest to opted-in users and throttles repeats", async () => {
    const { app, cookie, db, config, emailSender, sentEmails } = await setup();
    await request(app)
      .put("/api/me/preferences")
      .set("Cookie", cookie)
      .send({ workCalendarUrl: null, weeklyDigestEnabled: true });

    const firstRun = await sendWeeklyWorkspaceDigests(
      db,
      config,
      emailSender,
      new Date("2026-06-09T12:00:00Z"),
    );
    const secondRun = await sendWeeklyWorkspaceDigests(
      db,
      config,
      emailSender,
      new Date("2026-06-10T12:00:00Z"),
    );

    expect(firstRun.sent).toEqual([
      expect.objectContaining({ userId: 1, recipientEmail: "editor@example.com" }),
    ]);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].subject).toContain("Followthrough weekly digest");
    expect(sentEmails[0].text).toContain("T001: Prepare weekly packet");
    expect(secondRun.sent).toEqual([]);
    expect(secondRun.skipped).toEqual([{ userId: 1, reason: "already_sent_this_week" }]);
  });
});
