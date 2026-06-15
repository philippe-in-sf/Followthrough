import { Router } from "express";
import { taskInputSchema, taskUpdateInputSchema } from "../../shared/schemas.js";
import type { TaskDto, TaskReminderMode, TaskStatus } from "../../shared/types.js";
import { getAuditEvents, recordAuditEvent } from "../audit/auditLog.js";
import { resolveBlockerClearedAt } from "../blockers.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import type { EmailSender } from "../email/mailer.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";
import { getTaskAlert } from "./alerts.js";
import { sendManualTaskReminder } from "./reminders.js";

export type TaskRow = {
  public_id: string;
  description: string;
  blockers: string;
  blockers_cleared_at: string | null;
  status: TaskStatus;
  due_date: string | null;
  reminder_mode: TaskReminderMode;
  last_reminder_sent_at: string | null;
  private: number;
  created_by_user_id: number | null;
  archived_at: string | null;
  assignee_public_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_archived_at: string | null;
  origin_meeting_public_id: string | null;
  series_public_id: string | null;
};

type ResolvedTaskRelations = {
  assigneePersonId: number | null;
  originMeetingId: number | null;
  seriesId: number | null;
};

const taskSelect = `
  SELECT tasks.public_id, tasks.description, tasks.blockers, tasks.blockers_cleared_at,
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
         people.name AS assignee_name,
         people.email AS assignee_email,
         people.archived_at AS assignee_archived_at,
         origin_meetings.public_id AS origin_meeting_public_id,
         meeting_series.public_id AS series_public_id
  FROM tasks
  LEFT JOIN people ON people.id = tasks.assignee_person_id
  LEFT JOIN meetings AS origin_meetings ON origin_meetings.id = tasks.origin_meeting_id
  LEFT JOIN meeting_series ON meeting_series.id = tasks.series_id
`;

export function mapTaskRow(row: TaskRow, config: AppConfig): TaskDto {
  return {
    publicId: row.public_id,
    description: row.description,
    blockers: row.blockers,
    blockersClearedAt: row.blockers_cleared_at,
    assignee: row.assignee_public_id
      ? {
          publicId: row.assignee_public_id,
          name: row.assignee_name ?? "",
          email: row.assignee_email,
          archived: row.assignee_archived_at !== null,
        }
      : null,
    status: row.status,
    dueDate: row.due_date,
    originMeetingPublicId: row.origin_meeting_public_id,
    seriesPublicId: row.series_public_id,
    reminderMode: row.reminder_mode,
    lastReminderSentAt: row.last_reminder_sent_at,
    alert: getTaskAlert(row.due_date, row.status, config.dueSoonDays),
    private: row.private === 1,
    archived: row.archived_at !== null,
  };
}

function visibleTaskCondition() {
  return "(tasks.private = 0 OR tasks.created_by_user_id = ?)";
}

function canMakePrivate(createdByUserId: number | null, userId: number) {
  return createdByUserId === null || createdByUserId === userId;
}

function getTaskByPublicId(
  db: AppDatabase,
  config: AppConfig,
  publicId: string,
  userId: number,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `${taskSelect}
       WHERE tasks.public_id = ?
       AND ${visibleTaskCondition()}
       ${includeArchived ? "" : "AND tasks.archived_at IS NULL"}`,
    )
    .get(publicId, userId) as TaskRow | undefined;

  if (!row) throw notFound("Task not found");
  return mapTaskRow(row, config);
}

function resolveRelations(
  db: AppDatabase,
  input: {
    assigneePublicId?: string | null;
    originMeetingPublicId?: string | null;
    seriesPublicId?: string | null;
  },
  userId: number,
): ResolvedTaskRelations {
  const assignee = input.assigneePublicId
    ? (db
        .prepare("SELECT id FROM people WHERE public_id = ? AND archived_at IS NULL")
        .get(input.assigneePublicId) as { id: number } | undefined)
    : null;

  if (input.assigneePublicId && !assignee) {
    throw badRequest("Assignee not found");
  }

  const meeting = input.originMeetingPublicId
    ? (db
        .prepare(
          `SELECT id, series_id
           FROM meetings
           WHERE public_id = ?
           AND (private = 0 OR created_by_user_id = ?)
           AND archived_at IS NULL`,
        )
        .get(input.originMeetingPublicId, userId) as
        | { id: number; series_id: number | null }
        | undefined)
    : null;

  if (input.originMeetingPublicId && !meeting) {
    throw badRequest("Origin meeting not found");
  }

  const explicitSeries = input.seriesPublicId
    ? (db
        .prepare("SELECT id FROM meeting_series WHERE public_id = ? AND archived_at IS NULL")
        .get(input.seriesPublicId) as { id: number } | undefined)
    : null;

  if (input.seriesPublicId && !explicitSeries) {
    throw badRequest("Meeting series not found");
  }

  return {
    assigneePersonId: assignee?.id ?? null,
    originMeetingId: meeting?.id ?? null,
    seriesId: explicitSeries?.id ?? meeting?.series_id ?? null,
  };
}

export function taskRoutes(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null = null,
) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = req.user?.id ?? 0;
    const conditions = ["tasks.archived_at IS NULL", visibleTaskCondition()];
    const params: Array<string | number> = [userId];

    if (typeof req.query.assigneePublicId === "string" && req.query.assigneePublicId) {
      conditions.push("people.public_id = ?");
      params.push(req.query.assigneePublicId);
    }

    if (typeof req.query.status === "string" && req.query.status) {
      conditions.push("tasks.status = ?");
      params.push(req.query.status);
    }

    const rows = db
      .prepare(
        `${taskSelect}
         WHERE ${conditions.join(" AND ")}
         ORDER BY tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC`,
      )
      .all(...params) as TaskRow[];

    let tasks = rows.map((row) => mapTaskRow(row, config));
    if (req.query.alert === "dueSoon" || req.query.alert === "overdue") {
      tasks = tasks.filter((task) => task.alert === req.query.alert);
    }

    res.json({ tasks });
  });

  router.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, taskInputSchema);
      const task = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const relations = resolveRelations(db, input, userId);
        const publicId = nextPublicId(db, "T");
        const blockersClearedAt = resolveBlockerClearedAt({
          blockers: input.blockers,
          requestedCleared: input.blockersCleared,
        });
        const result = db
          .prepare(
            `INSERT INTO tasks
             (public_id, description, blockers, blockers_cleared_at, assignee_person_id, status, due_date, origin_meeting_id, series_id, reminder_mode, private, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            publicId,
            input.description,
            input.blockers,
            blockersClearedAt,
            relations.assigneePersonId,
            input.status,
            input.dueDate ?? null,
            relations.originMeetingId,
            relations.seriesId,
            input.reminderMode,
            input.private ? 1 : 0,
            userId,
          );

        if (relations.originMeetingId) {
          db.prepare("INSERT OR IGNORE INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)").run(
            relations.originMeetingId,
            Number(result.lastInsertRowid),
          );
        }

        const created = getTaskByPublicId(db, config, publicId, userId);
        recordAuditEvent(db, {
          entityType: "task",
          entityPublicId: created.publicId,
          action: "created",
          userId: req.user?.id ?? null,
          summary: "Created task",
          changes: { after: created },
        });

        if (created.originMeetingPublicId) {
          recordAuditEvent(db, {
            entityType: "meeting",
            entityPublicId: created.originMeetingPublicId,
            action: "task_added",
            userId: req.user?.id ?? null,
            summary: `Added task ${created.publicId}`,
            changes: { task: created },
          });
        }

        return created;
      });

      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId/audit", (req, res, next) => {
    try {
      getTaskByPublicId(db, config, req.params.publicId, req.user?.id ?? 0);
      res.json({ auditEvents: getAuditEvents(db, "task", req.params.publicId) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId", (req, res, next) => {
    try {
      res.json({ task: getTaskByPublicId(db, config, req.params.publicId, req.user?.id ?? 0) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, taskUpdateInputSchema);
      const task = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const existing = db
          .prepare(
            `SELECT id, blockers, blockers_cleared_at, created_by_user_id, private
             FROM tasks
             WHERE public_id = ?
             AND ${visibleTaskCondition()}
             AND archived_at IS NULL`,
          )
          .get(req.params.publicId, userId) as
          | {
              id: number;
              blockers: string;
              blockers_cleared_at: string | null;
              created_by_user_id: number | null;
              private: number;
            }
          | undefined;
        if (!existing) throw notFound("Task not found");
        if (input.private && !canMakePrivate(existing.created_by_user_id, userId)) {
          throw badRequest("Only the creator can make this task private");
        }
        const before = getTaskByPublicId(db, config, req.params.publicId, userId);

        const relations = resolveRelations(db, input, userId);
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
        db.prepare(
          `UPDATE tasks
           SET description = ?,
               blockers = ?,
               blockers_cleared_at = ?,
               assignee_person_id = ?,
               status = ?,
               due_date = ?,
               origin_meeting_id = ?,
               series_id = ?,
               reminder_mode = ?,
               private = ?,
               created_by_user_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          input.description,
          blockers,
          blockersClearedAt,
          relations.assigneePersonId,
          input.status,
          input.dueDate ?? null,
          relations.originMeetingId,
          relations.seriesId,
          input.reminderMode,
          input.private ? 1 : 0,
          createdByUserId,
          existing.id,
        );

        db.prepare("DELETE FROM meeting_tasks WHERE task_id = ?").run(existing.id);
        if (relations.originMeetingId) {
          db.prepare("INSERT INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)").run(
            relations.originMeetingId,
            existing.id,
          );
        }

        const updated = getTaskByPublicId(db, config, req.params.publicId, userId);
        recordAuditEvent(db, {
          entityType: "task",
          entityPublicId: updated.publicId,
          action: "updated",
          userId: req.user?.id ?? null,
          summary: "Updated task details",
          changes: { before, after: updated },
        });

        return updated;
      });

      res.json({ task });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:publicId/reminders", async (req, res, next) => {
    try {
      getTaskByPublicId(db, config, req.params.publicId, req.user?.id ?? 0);
      const reminder = await sendManualTaskReminder(
        db,
        config,
        emailSender,
        req.params.publicId,
        req.user?.id ?? null,
      );
      res.status(201).json({ reminder });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:publicId/archive", (req, res, next) => {
    try {
      withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const before = getTaskByPublicId(db, config, req.params.publicId, userId);
        const result = db
          .prepare(
            `UPDATE tasks
             SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ?
             AND (private = 0 OR created_by_user_id = ?)
             AND archived_at IS NULL`,
          )
          .run(req.params.publicId, userId);

        if (result.changes === 0) throw notFound("Task not found");
        recordAuditEvent(db, {
          entityType: "task",
          entityPublicId: before.publicId,
          action: "archived",
          userId: req.user?.id ?? null,
          summary: "Archived task",
          changes: { before },
        });
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
