import { afterEach, describe, expect, it } from "vitest";
import { cleanupExpiredAuthRecords } from "../../server/auth/cleanupJob";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("authentication record cleanup", () => {
  it("removes expired or inactive authentication records and retains active ones", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);
    db.prepare(
      "INSERT INTO users (name, email, password_hash, team_id, role) VALUES (?, ?, ?, ?, ?)",
    ).run("Cleanup User", "cleanup@example.com", "hash", 1, "member");

    const now = new Date("2026-07-24T18:00:00.000Z");
    const activeExpiry = "2026-07-25T18:00:00.000Z";
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?)`,
    ).run("expired-session", 1, "2026-07-24T17:00:00.000Z", "2026-07-24T17:30:00.000Z");
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?)`,
    ).run("idle-session", 1, activeExpiry, "2026-07-24T16:00:00.000Z");
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?)`,
    ).run("active-session", 1, activeExpiry, "2026-07-24T17:30:00.000Z");

    db.prepare(
      "INSERT INTO google_oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)",
    ).run("expired-state", 1, "2026-07-24T17:00:00.000Z");
    db.prepare(
      "INSERT INTO google_oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)",
    ).run("active-state", 1, activeExpiry);

    db.prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used_at)
       VALUES (?, ?, ?, ?)`,
    ).run("expired-reset", 1, "2026-07-24T17:00:00.000Z", null);
    db.prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used_at)
       VALUES (?, ?, ?, ?)`,
    ).run("used-reset", 1, activeExpiry, "2026-07-24T17:00:00.000Z");
    db.prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used_at)
       VALUES (?, ?, ?, ?)`,
    ).run("active-reset", 1, activeExpiry, null);

    const result = cleanupExpiredAuthRecords(
      db,
      { sessionIdleTimeoutMinutes: 60 },
      now,
    );

    expect(result).toEqual({
      sessions: 2,
      oauthStates: 1,
      passwordResetTokens: 2,
    });
    expect(
      db.prepare("SELECT token_hash FROM sessions ORDER BY token_hash").all(),
    ).toEqual([{ token_hash: "active-session" }]);
    expect(db.prepare("SELECT state FROM google_oauth_states ORDER BY state").all()).toEqual([
      { state: "active-state" },
    ]);
    expect(
      db.prepare("SELECT token_hash FROM password_reset_tokens ORDER BY token_hash").all(),
    ).toEqual([{ token_hash: "active-reset" }]);
  });
});
