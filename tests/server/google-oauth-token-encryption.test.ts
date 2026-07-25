import { afterEach, describe, expect, it } from "vitest";
import {
  getGoogleCalendarConnection,
  migrateGoogleCalendarTokensAtRest,
} from "../../server/calendar/oauth";
import {
  decryptGoogleOAuthToken,
  encryptGoogleOAuthToken,
} from "../../server/calendar/tokenEncryption";
import { loadConfig, type AppConfig } from "../../server/config";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];
const currentKey = Buffer.alloc(32, 11).toString("base64");
const previousKey = Buffer.alloc(32, 22).toString("base64");

function config(
  key = currentKey,
  previousKeys: string[] = [],
): AppConfig {
  return {
    ...loadConfig(),
    googleOAuthClientId: "client-id.apps.googleusercontent.com",
    googleOAuthClientSecret: "client-secret",
    googleOAuthRedirectUri: "https://followthrough.test/api/google-calendar/oauth/callback",
    googleOAuthTokenEncryptionKey: key,
    googleOAuthTokenEncryptionPreviousKeys: previousKeys,
  };
}

function setupPlaintextConnection() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, team_id, role) VALUES (?, ?, ?, ?, ?)",
  ).run("Avery", "avery@example.com", "unused-test-hash", 1, "member");
  db.prepare(
    `INSERT INTO google_calendar_connections (
       user_id, google_email, access_token, refresh_token, token_expires_at, scope
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    1,
    "avery@gmail.com",
    "plaintext-access-token",
    "plaintext-refresh-token",
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    "calendar.readonly",
  );
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("Google OAuth token encryption", () => {
  it("round-trips with authenticated encryption and unique nonces", () => {
    const appConfig = config();
    const context = "google-calendar:1:access_token";
    const first = encryptGoogleOAuthToken("secret-token", appConfig, context);
    const second = encryptGoogleOAuthToken("secret-token", appConfig, context);

    expect(first).toMatch(/^enc:v1:/);
    expect(first).not.toContain("secret-token");
    expect(second).not.toBe(first);
    expect(decryptGoogleOAuthToken(first, appConfig, context)).toEqual({
      plaintext: "secret-token",
      needsReencryption: false,
    });
  });

  it("rejects tampering and token swaps between fields", () => {
    const appConfig = config();
    const stored = encryptGoogleOAuthToken(
      "secret-token",
      appConfig,
      "google-calendar:1:access_token",
    );
    const tampered = `${stored.slice(0, -1)}${stored.endsWith("A") ? "B" : "A"}`;

    expect(() =>
      decryptGoogleOAuthToken(tampered, appConfig, "google-calendar:1:access_token"),
    ).toThrow(/authentication failed/i);
    expect(() =>
      decryptGoogleOAuthToken(stored, appConfig, "google-calendar:1:refresh_token"),
    ).toThrow(/authentication failed/i);
  });

  it("decrypts previous-key ciphertext and marks it for rotation", () => {
    const context = "google-calendar:1:access_token";
    const stored = encryptGoogleOAuthToken("secret-token", config(previousKey), context);

    expect(decryptGoogleOAuthToken(stored, config(currentKey, [previousKey]), context)).toEqual({
      plaintext: "secret-token",
      needsReencryption: true,
    });
  });

  it("migrates existing plaintext rows and returns decrypted tokens to callers", () => {
    const db = setupPlaintextConnection();
    const appConfig = config();

    expect(migrateGoogleCalendarTokensAtRest(db, appConfig)).toBe(1);
    const stored = db
      .prepare(
        "SELECT access_token, refresh_token FROM google_calendar_connections WHERE user_id = ?",
      )
      .get(1) as { access_token: string; refresh_token: string };
    expect(stored.access_token).toMatch(/^enc:v1:/);
    expect(stored.refresh_token).toMatch(/^enc:v1:/);
    expect(stored.access_token).not.toContain("plaintext-access-token");
    expect(stored.refresh_token).not.toContain("plaintext-refresh-token");

    expect(getGoogleCalendarConnection(db, appConfig, 1)).toMatchObject({
      access_token: "plaintext-access-token",
      refresh_token: "plaintext-refresh-token",
    });
    expect(migrateGoogleCalendarTokensAtRest(db, appConfig)).toBe(0);
  });

  it("re-encrypts stored tokens with the current key during rotation", () => {
    const db = setupPlaintextConnection();
    const oldConfig = config(previousKey);
    migrateGoogleCalendarTokensAtRest(db, oldConfig);
    const before = db
      .prepare(
        "SELECT access_token, refresh_token FROM google_calendar_connections WHERE user_id = ?",
      )
      .get(1) as { access_token: string; refresh_token: string };

    const rotatingConfig = config(currentKey, [previousKey]);
    expect(migrateGoogleCalendarTokensAtRest(db, rotatingConfig)).toBe(1);
    const after = db
      .prepare(
        "SELECT access_token, refresh_token FROM google_calendar_connections WHERE user_id = ?",
      )
      .get(1) as { access_token: string; refresh_token: string };
    expect(after.access_token).not.toBe(before.access_token);
    expect(after.refresh_token).not.toBe(before.refresh_token);
    expect(getGoogleCalendarConnection(db, config(currentKey), 1)).toMatchObject({
      access_token: "plaintext-access-token",
      refresh_token: "plaintext-refresh-token",
    });
  });

  it("fails closed when stored tokens exist without an encryption key", () => {
    const db = setupPlaintextConnection();
    expect(() => migrateGoogleCalendarTokensAtRest(db, config(""))).toThrow(
      /GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is required/,
    );
  });

  it("rejects malformed encryption keys", () => {
    expect(() =>
      encryptGoogleOAuthToken(
        "secret-token",
        config("not-a-32-byte-key"),
        "google-calendar:1:access_token",
      ),
    ).toThrow(/32-byte key|32 bytes/);
  });
});
