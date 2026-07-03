import { Router } from "express";
import { z } from "zod";
import {
  meetingLinkInputSchema,
  meetingInputSchema,
  meetingSeriesInputSchema,
  meetingUpdateInputSchema,
  publicIdSchema,
} from "../../shared/schemas.js";
import type { MeetingDto, MeetingLinkDto, MeetingSeriesDto, PersonDto } from "../../shared/types.js";
import { getAuditEvents, recordAuditEvent } from "../audit/auditLog.js";
import { resolveBlockerClearedAt } from "../blockers.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { mapTaskRows, type TaskRow } from "../tasks/taskRows.js";
import { parseBody } from "../validation.js";
import {
  getLatestSeriesMeetingContext,
  linkOpenSeriesTasksToMeeting,
  mergeCarriedLinks,
  mergeCarriedNotes,
} from "./carryOver.js";

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
  blockers: string;
  blockers_cleared_at: string | null;
  notes: string;
  private: number;
  created_by_user_id: number | null;
  archived_at: string | null;
};

type MeetingLinkRow = {
  id: number;
  label: string;
  url: string;
  link_type: MeetingLinkDto["linkType"];
};

type PersonRow = {
  public_id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string | null;
  archived_at: string | null;
};

const occurrenceSchema = z.object({
  title: z.string().trim().optional().or(z.literal("")),
  startsAt: z.string().datetime(),
  summary: z.string().trim().default(""),
  blockers: z.string().trim().default(""),
  blockersCleared: z.boolean().default(false),
  notes: z.string().default(""),
  links: z.array(meetingLinkInputSchema).default([]),
  attendeePublicIds: z.array(publicIdSchema).default([]),
  taskPublicIds: z.array(publicIdSchema).default([]),
  private: z.boolean().default(false),
});

const taskSelectForMeeting = `
  SELECT tasks.id AS task_id,
         tasks.public_id, tasks.description, tasks.blockers, tasks.notes, tasks.blockers_cleared_at,
         tasks.status, tasks.due_date,
         tasks.reminder_mode,
         (
           SELECT MAX(sent_at)
           FROM task_reminder_events
           WHERE task_reminder_events.task_id = tasks.id
         ) AS last_reminder_sent_at,
         tasks.private,
         tasks.created_by_user_id,
         tasks.archived_at,
         people.public_id AS assignee_public_id,
         people.first_name AS assignee_first_name,
         people.last_name AS assignee_last_name,
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
  AND (tasks.private = 0 OR tasks.created_by_user_id = ?)
  AND tasks.archived_at IS NULL
  ORDER BY tasks.status = 'Done', tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC
`;

function visibleMeetingCondition() {
  return "(meetings.private = 0 OR meetings.created_by_user_id = ?)";
}

function canMakePrivate(createdByUserId: number | null, userId: number) {
  return createdByUserId === null || createdByUserId === userId;
}

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
    firstName: row.first_name,
    lastName: row.last_name,
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

function getTeamSeriesRow(
  db: AppDatabase,
  publicId: string,
  teamId: number,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `SELECT id, public_id, title, cadence_label, active, archived_at
       FROM meeting_series
       WHERE public_id = ?
       AND team_id = ?
       ${includeArchived ? "" : "AND archived_at IS NULL"}`,
    )
    .get(publicId, teamId) as SeriesRow | undefined;

  if (!row) throw notFound("Meeting series not found");
  return row;
}

function getMeetingRow(
  db: AppDatabase,
  publicId: string,
  userId: number,
  teamId: number,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `SELECT meetings.id, meetings.public_id, meetings.title, meetings.starts_at,
              meetings.meeting_type, meeting_series.public_id AS series_public_id,
              meetings.summary, meetings.blockers, meetings.blockers_cleared_at,
              meetings.notes, meetings.private,
              meetings.created_by_user_id, meetings.archived_at
       FROM meetings
       LEFT JOIN meeting_series ON meeting_series.id = meetings.series_id
       WHERE meetings.public_id = ?
       AND meetings.team_id = ?
       AND ${visibleMeetingCondition()}
       ${includeArchived ? "" : "AND meetings.archived_at IS NULL"}`,
    )
    .get(publicId, teamId, userId) as MeetingRow | undefined;

  if (!row) throw notFound("Meeting not found");
  return row;
}

function getAttendees(db: AppDatabase, meetingId: number) {
  const rows = db
    .prepare(
      `SELECT people.public_id, people.first_name, people.last_name,
              people.name, people.email, people.archived_at
       FROM meeting_attendees
       JOIN people ON people.id = meeting_attendees.person_id
       WHERE meeting_attendees.meeting_id = ?
       ORDER BY people.name COLLATE NOCASE`,
    )
    .all(meetingId) as PersonRow[];

  return rows.map(toPerson);
}

function getMeetingTasks(
  db: AppDatabase,
  config: AppConfig,
  meetingId: number,
  userId: number,
) {
  const rows = db.prepare(taskSelectForMeeting).all(meetingId, userId) as TaskRow[];
  return mapTaskRows(db, config, rows, userId);
}

function getMeetingLinks(db: AppDatabase, meetingId: number): MeetingLinkDto[] {
  const rows = db
    .prepare(
      `SELECT id, label, url, link_type
       FROM meeting_links
       WHERE meeting_id = ?
       ORDER BY id ASC`,
    )
    .all(meetingId) as MeetingLinkRow[];

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    url: row.url,
    linkType: row.link_type,
  }));
}

function toMeeting(
  db: AppDatabase,
  config: AppConfig,
  row: MeetingRow,
  userId: number,
): MeetingDto {
  return {
    publicId: row.public_id,
    title: row.title,
    startsAt: row.starts_at,
    meetingType: row.meeting_type,
    seriesPublicId: row.series_public_id,
    summary: row.summary,
    blockers: row.blockers,
    blockersClearedAt: row.blockers_cleared_at,
    notes: row.notes,
    links: getMeetingLinks(db, row.id),
    attendees: getAttendees(db, row.id),
    tasks: getMeetingTasks(db, config, row.id, userId),
    private: row.private === 1,
    archived: row.archived_at !== null,
  };
}

function resolvePeople(db: AppDatabase, publicIds: string[], teamId: number) {
  const uniqueIds = [...new Set(publicIds)];
  return uniqueIds.map((publicId) => {
    const row = db
      .prepare("SELECT id FROM people WHERE public_id = ? AND team_id = ? AND archived_at IS NULL")
      .get(publicId, teamId) as { id: number } | undefined;
    if (!row) throw badRequest(`Person not found: ${publicId}`);
    return row.id;
  });
}

function resolveTasks(db: AppDatabase, publicIds: string[], userId: number, teamId: number) {
  const uniqueIds = [...new Set(publicIds)];
  return uniqueIds.map((publicId) => {
    const row = db
      .prepare(
        `SELECT id
         FROM tasks
         WHERE public_id = ?
         AND team_id = ?
         AND (private = 0 OR created_by_user_id = ?)
         AND archived_at IS NULL`,
      )
      .get(publicId, teamId, userId) as { id: number } | undefined;
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
  userId: number,
  teamId: number,
) {
  db.prepare("DELETE FROM meeting_attendees WHERE meeting_id = ?").run(meetingId);
  for (const personId of resolvePeople(db, attendeePublicIds, teamId)) {
    db.prepare("INSERT INTO meeting_attendees (meeting_id, person_id) VALUES (?, ?)").run(
      meetingId,
      personId,
    );
  }

  db.prepare("DELETE FROM meeting_tasks WHERE meeting_id = ?").run(meetingId);
  for (const taskId of resolveTasks(db, taskPublicIds, userId, teamId)) {
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

function replaceStructuredMeetingLinks(
  db: AppDatabase,
  meetingId: number,
  links: z.infer<typeof meetingLinkInputSchema>[],
) {
  db.prepare("DELETE FROM meeting_links WHERE meeting_id = ?").run(meetingId);

  for (const link of links) {
    db.prepare(
      `INSERT INTO meeting_links (meeting_id, label, url, link_type)
       VALUES (?, ?, ?, ?)`,
    ).run(meetingId, link.label, link.url, link.linkType);
  }
}

function createMeeting(
  db: AppDatabase,
  config: AppConfig,
  input: z.infer<typeof meetingInputSchema>,
  userId: number,
  teamId: number,
) {
  return withTransaction(db, () => {
    const series = input.seriesPublicId
      ? getTeamSeriesRow(db, input.seriesPublicId, teamId)
      : null;

    if (input.meetingType === "single" && series) {
      throw badRequest("Single meetings cannot belong to a recurring series");
    }

    if (input.meetingType === "recurring" && !series) {
      throw badRequest("Recurring meetings require a meeting series");
    }

    const carriedContext = series
      ? getLatestSeriesMeetingContext(db, series.id, input.startsAt, userId)
      : { notes: "", links: [] };
    const notes = series
      ? mergeCarriedNotes(carriedContext.notes, input.notes)
      : input.notes;
    const links = series
      ? mergeCarriedLinks(carriedContext.links, input.links)
      : input.links;

    const publicId = nextPublicId(db, "M");
    const blockersClearedAt = resolveBlockerClearedAt({
      blockers: input.blockers,
      requestedCleared: input.blockersCleared,
    });
    db.prepare(
      `INSERT INTO meetings
       (public_id, title, starts_at, meeting_type, series_id, summary, blockers, blockers_cleared_at, notes, private, created_by_user_id, team_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      publicId,
      input.title,
      input.startsAt,
      input.meetingType,
      series?.id ?? null,
      input.summary,
      input.blockers,
      blockersClearedAt,
      notes,
      input.private ? 1 : 0,
      userId,
      teamId,
    );

    const meetingRow = getMeetingRow(db, publicId, userId, teamId);
    replaceMeetingLinks(
      db,
      meetingRow.id,
      input.attendeePublicIds,
      input.taskPublicIds,
      series?.id ?? null,
      userId,
      teamId,
    );
    replaceStructuredMeetingLinks(db, meetingRow.id, links);

    const meeting = toMeeting(db, config, getMeetingRow(db, publicId, userId, teamId), userId);
    recordAuditEvent(db, {
      entityType: "meeting",
      entityPublicId: meeting.publicId,
      action: "created",
      userId,
      summary: "Created meeting",
      changes: { after: meeting },
    });

    return meeting;
  });
}

export function meetingRoutes(db: AppDatabase, config: AppConfig) {
  const meetingsRouter = Router();
  const seriesRouter = Router();

  seriesRouter.get("/", (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, public_id, title, cadence_label, active, archived_at
         FROM meeting_series
         WHERE team_id = ?
         AND archived_at IS NULL
         ORDER BY title COLLATE NOCASE`,
      )
      .all(req.user?.teamId ?? 0) as SeriesRow[];
    res.json({ series: rows.map(toSeries) });
  });

  seriesRouter.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, meetingSeriesInputSchema);
      const series = withTransaction(db, () => {
        const publicId = nextPublicId(db, "S");
        db.prepare(
          `INSERT INTO meeting_series (public_id, title, cadence_label, active, team_id)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(publicId, input.title, input.cadenceLabel || null, input.active ? 1 : 0, req.user?.teamId ?? 0);

        return getTeamSeriesRow(db, publicId, req.user?.teamId ?? 0);
      });

      res.status(201).json({ series: toSeries(series) });
    } catch (error) {
      next(error);
    }
  });

  seriesRouter.get("/:publicId", (req, res, next) => {
    try {
      res.json({ series: toSeries(getTeamSeriesRow(db, req.params.publicId, req.user?.teamId ?? 0)) });
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
           WHERE public_id = ? AND team_id = ? AND archived_at IS NULL`,
        )
        .run(input.title, input.cadenceLabel || null, input.active ? 1 : 0, req.params.publicId, req.user?.teamId ?? 0);

      if (result.changes === 0) throw notFound("Meeting series not found");
      res.json({ series: toSeries(getTeamSeriesRow(db, req.params.publicId, req.user?.teamId ?? 0)) });
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
           WHERE public_id = ? AND team_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId, req.user?.teamId ?? 0);

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
        const teamId = req.user?.teamId ?? 0;
        const series = getTeamSeriesRow(db, req.params.publicId, teamId);
        if (series.active !== 1) throw badRequest("Meeting series is inactive");

        const userId = req.user?.id ?? 0;
        const carriedContext = getLatestSeriesMeetingContext(
          db,
          series.id,
          input.startsAt,
          userId,
        );
        const notes = mergeCarriedNotes(carriedContext.notes, input.notes);
        const links = mergeCarriedLinks(carriedContext.links, input.links);

        const publicId = nextPublicId(db, "M");
        const blockersClearedAt = resolveBlockerClearedAt({
          blockers: input.blockers,
          requestedCleared: input.blockersCleared,
        });
        db.prepare(
          `INSERT INTO meetings
           (public_id, title, starts_at, meeting_type, series_id, summary, blockers, blockers_cleared_at, notes, private, created_by_user_id, team_id)
           VALUES (?, ?, ?, 'recurring', ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          publicId,
          input.title || series.title,
          input.startsAt,
          series.id,
          input.summary,
          input.blockers,
          blockersClearedAt,
          notes,
          input.private ? 1 : 0,
          userId,
          teamId,
        );

        const row = getMeetingRow(db, publicId, userId, teamId);
        replaceMeetingLinks(
          db,
          row.id,
          input.attendeePublicIds,
          input.taskPublicIds,
          series.id,
          userId,
          teamId,
        );
        replaceStructuredMeetingLinks(db, row.id, links);
        linkOpenSeriesTasksToMeeting(db, series.id, row.id, userId);
        const meeting = toMeeting(db, config, getMeetingRow(db, publicId, userId, teamId), userId);
        recordAuditEvent(db, {
          entityType: "meeting",
          entityPublicId: meeting.publicId,
          action: "created",
          userId: req.user?.id ?? null,
          summary: "Created meeting",
          changes: { after: meeting },
        });
        return meeting;
      });

      res.status(201).json({ meeting });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.get("/", (req, res) => {
    const userId = req.user?.id ?? 0;
    const archiveCondition =
      req.query.archived === "true"
        ? "meetings.archived_at IS NOT NULL"
        : "meetings.archived_at IS NULL";
    const rows = db
      .prepare(
        `SELECT meetings.id, meetings.public_id, meetings.title, meetings.starts_at,
                meetings.meeting_type, meeting_series.public_id AS series_public_id,
                meetings.summary, meetings.blockers, meetings.blockers_cleared_at,
                meetings.notes, meetings.private,
                meetings.created_by_user_id, meetings.archived_at
         FROM meetings
         LEFT JOIN meeting_series ON meeting_series.id = meetings.series_id
         WHERE ${archiveCondition}
         AND meetings.team_id = ?
         AND ${visibleMeetingCondition()}
         ORDER BY meetings.starts_at DESC`,
      )
      .all(req.user?.teamId ?? 0, userId) as MeetingRow[];

    res.json({ meetings: rows.map((row) => toMeeting(db, config, row, userId)) });
  });

  meetingsRouter.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, meetingInputSchema);
      res.status(201).json({
        meeting: createMeeting(db, config, input, req.user?.id ?? 0, req.user?.teamId ?? 0),
      });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.get("/:publicId/audit", (req, res, next) => {
    try {
      getMeetingRow(db, req.params.publicId, req.user?.id ?? 0, req.user?.teamId ?? 0, true);
      res.json({ auditEvents: getAuditEvents(db, "meeting", req.params.publicId) });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.get("/:publicId", (req, res, next) => {
    try {
      res.json({
        meeting: toMeeting(
          db,
          config,
          getMeetingRow(db, req.params.publicId, req.user?.id ?? 0, req.user?.teamId ?? 0),
          req.user?.id ?? 0,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, meetingUpdateInputSchema);
      const meeting = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const teamId = req.user?.teamId ?? 0;
        const existing = getMeetingRow(db, req.params.publicId, userId, teamId);
        if (input.private && !canMakePrivate(existing.created_by_user_id, userId)) {
          throw badRequest("Only the creator can make this meeting private");
        }
        const before = toMeeting(db, config, existing, userId);
        const series = input.seriesPublicId
          ? getTeamSeriesRow(db, input.seriesPublicId, teamId)
          : null;

        if (input.meetingType === "single" && series) {
          throw badRequest("Single meetings cannot belong to a recurring series");
        }

        if (input.meetingType === "recurring" && !series) {
          throw badRequest("Recurring meetings require a meeting series");
        }

        const createdByUserId =
          input.private && existing.created_by_user_id === null
            ? userId
            : existing.created_by_user_id;
        const blockers = input.blockers ?? existing.blockers;
        const blockersClearedAt = resolveBlockerClearedAt({
          blockers,
          requestedCleared: input.blockersCleared,
          existingClearedAt: existing.blockers_cleared_at,
        });
        const notes = input.notes ?? existing.notes;
        const links = input.links ?? getMeetingLinks(db, existing.id);
        db.prepare(
          `UPDATE meetings
           SET title = ?, starts_at = ?, meeting_type = ?, series_id = ?,
               summary = ?, blockers = ?, blockers_cleared_at = ?,
               notes = ?, private = ?, created_by_user_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          input.title,
          input.startsAt,
          input.meetingType,
          series?.id ?? null,
          input.summary,
          blockers,
          blockersClearedAt,
          notes,
          input.private ? 1 : 0,
          createdByUserId,
          existing.id,
        );

        replaceMeetingLinks(
          db,
          existing.id,
          input.attendeePublicIds,
          input.taskPublicIds,
          series?.id ?? null,
          userId,
          teamId,
        );
        replaceStructuredMeetingLinks(db, existing.id, links);

        const updated = toMeeting(
          db,
          config,
          getMeetingRow(db, req.params.publicId, userId, teamId),
          userId,
        );
        recordAuditEvent(db, {
          entityType: "meeting",
          entityPublicId: updated.publicId,
          action: "updated",
          userId: req.user?.id ?? null,
          summary: "Updated meeting details",
          changes: { before, after: updated },
        });

        return updated;
      });

      res.json({ meeting });
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.post("/:publicId/archive", (req, res, next) => {
    try {
      withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const existing = getMeetingRow(db, req.params.publicId, userId, req.user?.teamId ?? 0);
        const before = toMeeting(db, config, existing, userId);
        const result = db
          .prepare(
            `UPDATE meetings
             SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ?
             AND team_id = ?
             AND (private = 0 OR created_by_user_id = ?)
             AND archived_at IS NULL`,
          )
          .run(req.params.publicId, req.user?.teamId ?? 0, userId);

        if (result.changes === 0) throw notFound("Meeting not found");
        recordAuditEvent(db, {
          entityType: "meeting",
          entityPublicId: before.publicId,
          action: "archived",
          userId: req.user?.id ?? null,
          summary: "Archived meeting",
          changes: { before },
        });
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  meetingsRouter.post("/:publicId/restore", (req, res, next) => {
    try {
      const meeting = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const existing = getMeetingRow(
          db,
          req.params.publicId,
          userId,
          req.user?.teamId ?? 0,
          true,
        );
        const before = toMeeting(db, config, existing, userId);
        if (!before.archived) throw badRequest("Meeting is not archived");

        const result = db
          .prepare(
            `UPDATE meetings
             SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ?
             AND team_id = ?
             AND (private = 0 OR created_by_user_id = ?)
             AND archived_at IS NOT NULL`,
          )
          .run(req.params.publicId, req.user?.teamId ?? 0, userId);

        if (result.changes === 0) throw notFound("Meeting not found");
        const after = toMeeting(
          db,
          config,
          getMeetingRow(db, req.params.publicId, userId, req.user?.teamId ?? 0),
          userId,
        );
        recordAuditEvent(db, {
          entityType: "meeting",
          entityPublicId: after.publicId,
          action: "restored",
          userId: req.user?.id ?? null,
          summary: "Restored meeting",
          changes: { before, after },
        });

        return after;
      });

      res.json({ meeting });
    } catch (error) {
      next(error);
    }
  });

  return { meetingsRouter, seriesRouter };
}
