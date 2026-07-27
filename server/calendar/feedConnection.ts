import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import {
  assertSecretEncryptionConfigured,
  decryptSecret,
  encryptSecret,
} from "../secretEncryption.js";

export class InvalidCalendarFeedUrlError extends Error {
  constructor() {
    super("Enter a valid https or webcal iCalendar feed URL.");
  }
}

type CalendarFeedConnectionRow = {
  feed_url_ciphertext: string;
};

function encryptionSettings(config: AppConfig) {
  return {
    key: config.calendarFeedEncryptionKey,
    previousKeys: config.calendarFeedEncryptionPreviousKeys,
    keyLabel: "CALENDAR_FEED_ENCRYPTION_KEY",
    previousKeysLabel: "CALENDAR_FEED_ENCRYPTION_PREVIOUS_KEYS",
    subject: "Calendar feed URL",
    missingKeyMessage:
      "CALENDAR_FEED_ENCRYPTION_KEY is required to store calendar feed URLs",
  };
}

function encryptionContext(userId: number) {
  return `calendar-feed:${userId}:feed_url`;
}

export function isCalendarFeedEncryptionConfigured(config: AppConfig) {
  return Boolean(config.calendarFeedEncryptionKey.trim());
}

export function assertCalendarFeedEncryptionConfigured(config: AppConfig) {
  assertSecretEncryptionConfigured(encryptionSettings(config));
}

export function parseCalendarFeedUrl(value: string) {
  const candidate = value.trim().replace(/^webcal:/i, "https:");

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      throw new InvalidCalendarFeedUrlError();
    }
    url.hash = "";
    return url.toString();
  } catch (error) {
    if (error instanceof InvalidCalendarFeedUrlError) throw error;
    throw new InvalidCalendarFeedUrlError();
  }
}

export function getCalendarFeedConnectionStatus(
  db: AppDatabase,
  config: AppConfig,
  userId: number,
) {
  const row = db
    .prepare("SELECT user_id FROM calendar_feed_connections WHERE user_id = ?")
    .get(userId);
  return {
    available: isCalendarFeedEncryptionConfigured(config),
    configured: Boolean(row),
  };
}

export function saveCalendarFeedConnection(
  db: AppDatabase,
  config: AppConfig,
  userId: number,
  rawFeedUrl: string,
) {
  const feedUrl = parseCalendarFeedUrl(rawFeedUrl);
  const ciphertext = encryptSecret(
    feedUrl,
    encryptionSettings(config),
    encryptionContext(userId),
  );

  db.prepare(
    `
      INSERT INTO calendar_feed_connections (
        user_id,
        feed_url_ciphertext,
        updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        feed_url_ciphertext = excluded.feed_url_ciphertext,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(userId, ciphertext);
}

export function getCalendarFeedUrl(
  db: AppDatabase,
  config: AppConfig,
  userId: number,
) {
  const row = db
    .prepare(
      "SELECT feed_url_ciphertext FROM calendar_feed_connections WHERE user_id = ?",
    )
    .get(userId) as CalendarFeedConnectionRow | undefined;
  if (!row) return null;

  const decrypted = decryptSecret(
    row.feed_url_ciphertext,
    encryptionSettings(config),
    encryptionContext(userId),
  );
  if (decrypted.needsReencryption) {
    const ciphertext = encryptSecret(
      decrypted.plaintext,
      encryptionSettings(config),
      encryptionContext(userId),
    );
    db.prepare(
      `
        UPDATE calendar_feed_connections
        SET feed_url_ciphertext = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `,
    ).run(ciphertext, userId);
  }
  return decrypted.plaintext;
}

export function deleteCalendarFeedConnection(db: AppDatabase, userId: number) {
  db.prepare("DELETE FROM calendar_feed_connections WHERE user_id = ?").run(userId);
}
