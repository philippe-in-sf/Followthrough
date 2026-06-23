import type { AppDatabase } from "../db/database.js";

export class InvalidWorkCalendarUrlError extends Error {
  constructor() {
    super("Enter a valid http or https calendar URL.");
  }
}

export type UserPreferences = {
  userId: number;
  workCalendarUrl: string | null;
};

type UserPreferencesRow = {
  user_id: number;
  work_calendar_url: string;
};

export function parseWorkCalendarUrl(value: string | null) {
  if (value === null) return null;

  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new InvalidWorkCalendarUrlError();
    }
    return candidate;
  } catch (error) {
    if (error instanceof InvalidWorkCalendarUrlError) throw error;
    throw new InvalidWorkCalendarUrlError();
  }
}

export function getUserPreferences(db: AppDatabase, userId: number): UserPreferences {
  const row = db
    .prepare(
      `
        SELECT user_id, work_calendar_url
        FROM user_preferences
        WHERE user_id = ?
      `,
    )
    .get(userId) as UserPreferencesRow | undefined;

  return {
    userId,
    workCalendarUrl: row?.work_calendar_url ? row.work_calendar_url : null,
  };
}

export function upsertUserPreferences(
  db: AppDatabase,
  input: { userId: number; workCalendarUrl: string | null },
): UserPreferences {
  const workCalendarUrl = parseWorkCalendarUrl(input.workCalendarUrl);

  db.prepare(
    `
      INSERT INTO user_preferences (
        user_id,
        work_calendar_url,
        updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        work_calendar_url = excluded.work_calendar_url,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(input.userId, workCalendarUrl ?? "");

  return getUserPreferences(db, input.userId);
}
