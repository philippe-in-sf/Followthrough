import { Router } from "express";
import type { MeetingNoteDto, MeetingNoteMatchReason, PersonDto } from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";

type MeetingNoteRange = "day" | "week" | "month" | "custom";

type MeetingNoteRow = {
  id: number;
  public_id: string;
  title: string;
  starts_at: string;
  notes: string;
  private: number;
  created_by_user_id: number | null;
  creator_match: number;
  attendee_match: number;
};

type AttendeeRow = {
  public_id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string | null;
  archived_at: string | null;
};

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function parseDateOnly(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !dateOnlyPattern.test(value)) {
    throw badRequest(`${fieldName} must be YYYY-MM-DD`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw badRequest(`${fieldName} must be YYYY-MM-DD`);
  return date;
}

function parseNow(value: unknown) {
  if (typeof value !== "string") return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest("now must be a valid date");
  return date;
}

function resolveWindow(query: Record<string, unknown>) {
  const range = (query.range ?? "week") as MeetingNoteRange;
  if (!["day", "week", "month", "custom"].includes(range)) {
    throw badRequest("Invalid range");
  }

  if (range === "custom") {
    const startDate = parseDateOnly(query.startDate, "startDate");
    const endDate = parseDateOnly(query.endDate, "endDate");
    if (startDate > endDate) throw badRequest("Start date must be before end date");
    return {
      range,
      startsAt: startDate.toISOString(),
      endsAt: addDays(endDate, 1).toISOString(),
    };
  }

  const now = parseNow(query.now);
  const startsAt =
    range === "day" ? addDays(now, -1) : range === "week" ? addDays(now, -7) : addMonths(now, -1);
  return {
    range,
    startsAt: startsAt.toISOString(),
    endsAt: now.toISOString(),
  };
}

function toPerson(row: AttendeeRow): PersonDto {
  return {
    publicId: row.public_id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    email: row.email,
    archived: row.archived_at !== null,
  };
}

function getAttendees(db: AppDatabase, meetingId: number): PersonDto[] {
  const rows = db
    .prepare(
      `SELECT people.public_id, people.first_name, people.last_name,
              people.name, people.email, people.archived_at
       FROM meeting_attendees
       JOIN people ON people.id = meeting_attendees.person_id
       WHERE meeting_attendees.meeting_id = ?
       AND people.archived_at IS NULL
       ORDER BY people.name COLLATE NOCASE`,
    )
    .all(meetingId) as AttendeeRow[];

  return rows.map(toPerson);
}

function toMeetingNote(db: AppDatabase, row: MeetingNoteRow): MeetingNoteDto {
  const matchReasons: MeetingNoteMatchReason[] = [];
  if (row.creator_match === 1) matchReasons.push("creator");
  if (row.attendee_match === 1) matchReasons.push("attendee");

  return {
    publicId: row.public_id,
    title: row.title,
    startsAt: row.starts_at,
    notes: row.notes,
    matchReasons,
    attendees: getAttendees(db, row.id),
    private: row.private === 1,
  };
}

export function notesRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/meeting-notes", (req, res, next) => {
    try {
      const user = req.user;
      if (!user) throw badRequest("Authentication required");
      const window = resolveWindow(req.query);

      const rows = db
        .prepare(
          `SELECT meetings.id, meetings.public_id, meetings.title, meetings.starts_at,
                  meetings.notes, meetings.private, meetings.created_by_user_id,
                  CASE WHEN meetings.created_by_user_id = ? THEN 1 ELSE 0 END AS creator_match,
                  CASE WHEN EXISTS (
                    SELECT 1
                    FROM meeting_attendees
                    JOIN people ON people.id = meeting_attendees.person_id
                    WHERE meeting_attendees.meeting_id = meetings.id
                    AND people.team_id = meetings.team_id
                    AND people.archived_at IS NULL
                    AND lower(people.email) = lower(?)
                  ) THEN 1 ELSE 0 END AS attendee_match
           FROM meetings
           WHERE meetings.team_id = ?
           AND meetings.archived_at IS NULL
           AND trim(meetings.notes) <> ''
           AND meetings.starts_at >= ?
           AND meetings.starts_at < ?
           AND (meetings.private = 0 OR meetings.created_by_user_id = ?)
           AND (
             meetings.created_by_user_id = ?
             OR EXISTS (
               SELECT 1
               FROM meeting_attendees
               JOIN people ON people.id = meeting_attendees.person_id
               WHERE meeting_attendees.meeting_id = meetings.id
               AND people.team_id = meetings.team_id
               AND people.archived_at IS NULL
               AND lower(people.email) = lower(?)
             )
           )
           ORDER BY meetings.starts_at DESC, meetings.public_id DESC`,
        )
        .all(
          user.id,
          user.email,
          user.teamId,
          window.startsAt,
          window.endsAt,
          user.id,
          user.id,
          user.email,
        ) as MeetingNoteRow[];

      res.json({
        range: window.range,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        notes: rows.map((row) => toMeetingNote(db, row)),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
