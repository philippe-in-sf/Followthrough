import { Router } from "express";
import { z } from "zod";
import {
  meetingInputSchema,
  meetingSeriesInputSchema,
  publicIdSchema,
} from "../../shared/schemas.js";
import type { MeetingDto, MeetingSeriesDto, PersonDto } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { mapTaskRow, type TaskRow } from "../tasks/routes.js";
import { parseBody } from "../validation.js";
import { linkOpenSeriesTasksToMeeting } from "./carryOver.js";

type SeriesRow = {
  id: number;
  public_id: string;
  title: string;
  cadence_label: string | null;
  active: number;
  archived_at: string | null;
};

type MeetingRow = {
  id: number;
  public_id: string;
  title: string;
  starts_at: string;
  meeting_type: "single" | "recurring";
  series_public_id: string | null;
  summary: string;
  archived_at: string | null;
};

type PersonRow = {
  public_id: string;
  name: string;
  email: string | null;
  archived_at: string | null;
};

const occurrenceSchema = z.object({
  title: z.string().trim().optional().or(z.literal("")),
  startsAt: z.string().datetime(),
  summary: z.string().trim().default(""),
  attendeePublicIds: z.array(publicIdSchema).default([]),
});

const taskSelectForMeeting = `
  SELECT tasks.public_id, tasks.description, tasks.status, tasks.due_date,
         tasks.archived_at,
         people.public_id AS assignee_public_id,
         people.name AS assignee_name,
         people.email AS assignee_email,
         people.archived_at AS assignee_archived_at,
         origin_meetings.public_id AS origin_meeting_public_id,
         meeting_series.public_id AS series_public_id
  FROM meeting_tasks
  JOIN tasks ON tasks.id = meeting_tasks.task_id
  LEFT JOIN people ON people.id = tasks.assignee_person_id
  LEFT JOIN meetings AS origin_meetings ON origin_meetings.id = tasks.origin_meeting_id
  LEFT JOIN meeting_series ON meeting_series.id = tasks.series_id
  WHERE meeting_tasks.meeting_id = ?
  AND tasks.archived_at IS NULL
  ORDER BY tasks.status = 'Done', tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC
`;

function toSeries(row: SeriesRow): MeetingSeriesDto {
  return {
    publicId: row.public_id,
    title: row.title,
    cadenceLabel: row.cadence_label,
    active: row.active === 1,
    archived: row.archived_at !== null,
  };
}

function toPerson(row: PersonRow): PersonDto {
  return {
    publicId: row.public_id,
    name: row.name,
    email: row.email,
    archived: row.archived_at !== null,
  };
}

function getSeriesRow(db: AppDatabase, publicId: string, includeArchived = false) {
  const row = db
    .prepare(
      `SELECT id, public_id, title, cadence_label, active, archived_at
       FROM meeting_series
       WHERE public_id = ? ${includeArchived ? "" : "AND archived_at IS NULL"}`,
    )
    .get(publicId) as SeriesRow | undefined;

  if (!row) throw notFound("Meeting series not found");
  return row;
}

function getMeetingRow(db: AppDatabase, publicId: string, includeArchived = false) {
  const row = db
    .prepare(
      `SELECT meetings.id, meetings.public_id, meetings.title, meetings.starts_at,
              meetings.meeting_type, meeting_series.public_id AS series_public_id,
              meetings.summary, meetings.archived_at
       FROM meetings
       LEFT JOIN meeting_series ON meeting_series.id = meetings.series_id
       WHERE meetings.public_id = ? ${includeArchived ? "" : "AND meetings.archived_at IS NULL"}`,
    )
    .get(publicId) as MeetingRow | undefined;

  if (!row) throw notFound("Meeting not found");
  return row;
}

function getAttendees(db: AppDatabase, meetingId: number) {
  const rows = db
    .prepare(
      `SELECT people.public_id, people.name, people.email, people.archived_at
       FROM meeting_attendees
       JOIN people ON people.id = meeting_attendees.person_id
       WHERE meeting_attendees.meeting_id = ?
       ORDER BY people.name COLLATE NOCASE`,
    )
    .all(meetingId) as PersonRow[];

  return rows.map(toPerson);
}

function getMeetingTasks(db: AppDatabase, config: AppConfig, meetingId: number) {
  const rows = db.prepare(taskSelectForMeeting).all(meetingId) as TaskRow[];
  return rows.map((row) => mapTaskRow(row, config));
}

function toMeeting(db: AppDatabase, config: AppConfig, row: MeetingRow): MeetingDto {
  return {
    publicId: row.public_id,
    title: row.title,
    startsAt: row.starts_at,
    meetingType: row.meeting_type,
    seriesPublicId: row.series_public_id,
    summary: row.summary,
    attendees: getAttendees(db, row.id),
    tasks: getMeetingTasks(db, config, row.id),
    archived: row.archived_at !== null,
  };
}

function resolvePeople(db: AppDatabase, publicIds: string[]) {
  const uniqueIds = [...new Set(publicIds)];
  return uniqueIds.map((publicId) => {
    const row = db
      .prepare("SELECT id FROM people WHERE public_id = ? AND archived_at IS NULL")
      .get(publicId) as { id: number } | undefined;
    if (!row) throw badRequest(`Person not found: ${publicId}`);
    return row.id;
  });
}

function resolveTasks(db: AppDatabase, publicIds: string[]) {
  const uniqueIds = [...new Set(publicIds)];
  return uniqueIds.map((publicId) => {
    const row = db
      .prepare("SELECT id FROM tasks WHERE public_id = ? AND archived_at IS NULL")
      .get(publicId) as { id: number } | undefined;
    if (!row) throw badRequest(`Task not found: ${publicId}`);
    return row.id;
  });
}

function replaceMeetingLinks(
  db: AppDatabase,
  meetingId: number,
  attendeePublicIds: string[],
  taskPublicIds: string[],
  seriesId: number | null,
) {
  db.prepare("DELETE FROM meeting_attendees WHERE meeting_id = ?").run(meetingId);
  for (const personId of resolvePeople(db, attendeePublicIds)) {
    db.prepare("INSERT INTO meeting_attendees (meeting_id, person_id) VALUES (?, ?)").run(
      meetingId,
      personId,
    );
  }

  db.prepare("DELETE FROM meeting_tasks WHERE meeting_id = ?").run(meetingId);
  for (const taskId of resolveTasks(db, taskPublicIds)) {
    db.prepare("INSERT INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)").run(
      meetingId,
      taskId,
    );
    if (seriesId) {
      db.prepare("UPDATE tasks SET series_id = COALESCE(series_id, ?) WHERE id = ?").run(
        seriesId,
        taskId,
      );
    }
  }
}

function createMeeting(
  db: AppDatabase,
  config: AppConfig,
  input: z.infer<typeof meetingInputSchema>,
) {
  return withTransaction(db, () => {
    const series = input.seriesPublicId ? getSeriesRow(db, input.seriesPublicId) : null;

    if (input.meetingType === "single" && series) {
      throw badRequest("Single meetings cannot belong to a recurring series");
    }

    if (input.meetingType === "recurring" && !series) {
      throw badRequest("Recurring meetings require a meeting series");
    }

    const publicId = nextPublicId(db, "M");
    db.prepare(
      `INSERT INTO meetings (public_id, title, starts_at, meeting_type, series_id, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      publicId,
      input.title,
      input.startsAt,
      input.meetingType,
      series?.id ?? null,
      input.summary,
    );

    const meeting = getMeetingRow(db, publicId);
    replaceMeetingLinks(
      db,
      meeting.id,
      input.attendeePublicIds,
      input.taskPublicIds,
      series?.id ?? null,
    );

    return toMeeting(db, config, getMeetingRow(db, publicId));
  });
}

export function meetingRoutes(db: AppDatabase, config: AppConfig) {
  const meetingsRouter = Router();
  const seriesRouter = Router();

  seriesRouter.get("/", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, public_id, title, cadence_label, active, archived_at
         FROM meeting_series
         WHERE archived_at IS NULL
         ORDER BY title COLLATE NOCASE`,
      )
      .all() as SeriesRow[];
    res.json({ series: rows.map(toSeries) });
  });

  seriesRouter.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, meetingSeriesInputSchema);
      const series = withTransaction(db, () => {
        const publicId = nextPublicId(db, "S");
        db.prepare(
          `INSERT INTO meeting_series (public_id, title, cadence_label, active)
           VALUES (?, ?, ?, ?)`,
        ).run(publicId, input.title, input.cadenceLabel || null, input.active ? 1 : 0);

        return getSeriesRow(db, publicId);
      });

      res.status(201).json({ series: toSeries(series) });
    } catch (error) {
      next(error);
    }
  });

  seriesRouter.get("/:publicId", (req, res, next) => {
    try {
      res.json({ series: toSeries(getSeriesRow(db, req.params.publicId)) });
    } catch (error) {
      next(error);
    }
  });

  seriesRouter.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, meetingSeriesInputSchema);
      const result = db
        .prepare(
          `UPDATE meeting_series
           SET title = ?, cadence_label = ?, active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .run(input.title, input.cadenceLabel || null, input.active ? 1 : 0, req.params.publicId);

      if (result.changes === 0) throw notFound("Meeting series not found");
      res.json({ series: toSeries(getSeriesRow(db, req.params.publicId)) });
    } catch (error) {
      next(error);
    }
  });

  seriesRouter.post("/:publicId/archive", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE meeting_series
           SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId);

      if (result.changes === 0) throw notFound("Meeting series not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  seriesRouter.post("/:publicId/occurrences", (req, res, next) => {
    try {
      const input = parseBody(req, occurrenceSchema);
      const meeting = withTransaction(db, () => {
        const series = getSeriesRow(db, req.params.publicId);
        if (series.active !== 1) throw badRequest("Meeting series is inactive");

        const publicId = nextPublicId(db, "M");
        db.prepare(
          `INSERT INTO meetings (public_id, title, starts_at, meeting_type, series_id, summary)
           VALUES (?, ?, ?, 'recurring', ?, ?)`,
        ).run(
          publicId,
          input.title || series.title,
          input.startsAt,
          series.id,
          input.summary,
        );

        const row = getMeetingRow(db, publicId);
        replaceMeetingLinks(db, row.id, input.attendeePublicIds, [], series.id);
        linkOpenSeriesTasksToMeeting(db, series.id, row.id);
        return toMeeting(db, config, getMeetingRow(db, publicId));
      });

      res.status(201).json({ meeting });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.get("/", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT meetings.id, meetings.public_id, meetings.title, meetings.starts_at,
                meetings.meeting_type, meeting_series.public_id AS series_public_id,
                meetings.summary, meetings.archived_at
         FROM meetings
         LEFT JOIN meeting_series ON meeting_series.id = meetings.series_id
         WHERE meetings.archived_at IS NULL
         ORDER BY meetings.starts_at DESC`,
      )
      .all() as MeetingRow[];

    res.json({ meetings: rows.map((row) => toMeeting(db, config, row)) });
  });

  meetingsRouter.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, meetingInputSchema);
      res.status(201).json({ meeting: createMeeting(db, config, input) });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.get("/:publicId", (req, res, next) => {
    try {
      res.json({ meeting: toMeeting(db, config, getMeetingRow(db, req.params.publicId)) });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, meetingInputSchema);
      const meeting = withTransaction(db, () => {
        const existing = getMeetingRow(db, req.params.publicId);
        const series = input.seriesPublicId ? getSeriesRow(db, input.seriesPublicId) : null;

        if (input.meetingType === "single" && series) {
          throw badRequest("Single meetings cannot belong to a recurring series");
        }

        if (input.meetingType === "recurring" && !series) {
          throw badRequest("Recurring meetings require a meeting series");
        }

        db.prepare(
          `UPDATE meetings
           SET title = ?, starts_at = ?, meeting_type = ?, series_id = ?,
               summary = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          input.title,
          input.startsAt,
          input.meetingType,
          series?.id ?? null,
          input.summary,
          existing.id,
        );

        replaceMeetingLinks(
          db,
          existing.id,
          input.attendeePublicIds,
          input.taskPublicIds,
          series?.id ?? null,
        );

        return toMeeting(db, config, getMeetingRow(db, req.params.publicId));
      });

      res.json({ meeting });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.post("/:publicId/archive", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE meetings
           SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId);

      if (result.changes === 0) throw notFound("Meeting not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return { meetingsRouter, seriesRouter };
}
