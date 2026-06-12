import { Router } from "express";
import { taskInputSchema } from "../../shared/schemas.js";
import type { TaskDto, TaskReminderMode, TaskStatus } from "../../shared/types.js";
import { getAuditEvents, recordAuditEvent } from "../audit/auditLog.js";
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
  status: TaskStatus;
  due_date: string | null;
  reminder_mode: TaskReminderMode;
  last_reminder_sent_at: string | null;
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
  SELECT tasks.public_id, tasks.description, tasks.status, tasks.due_date,
         tasks.reminder_mode,
         (
           SELECT MAX(sent_at)
           FROM task_reminder_events
           WHERE task_reminder_events.task_id = tasks.id
         ) AS last_reminder_sent_at,
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
    archived: row.archived_at !== null,
  };
}

function getTaskByPublicId(
  db: AppDatabase,
  config: AppConfig,
  publicId: string,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `${taskSelect}
       WHERE tasks.public_id = ? ${includeArchived ? "" : "AND tasks.archived_at IS NULL"}`,
    )
    .get(publicId) as TaskRow | undefined;

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
        .prepare("SELECT id, series_id FROM meetings WHERE public_id = ? AND archived_at IS NULL")
        .get(input.originMeetingPublicId) as { id: number; series_id: number | null } | undefined)
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
    const conditions = ["tasks.archived_at IS NULL"];
    const params: string[] = [];

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
        const relations = resolveRelations(db, input);
        const publicId = nextPublicId(db, "T");
        const result = db
          .prepare(
            `INSERT INTO tasks
             (public_id, description, assignee_person_id, status, due_date, origin_meeting_id, series_id, reminder_mode)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            publicId,
            input.description,
            relations.assigneePersonId,
            input.status,
            input.dueDate ?? null,
            relations.originMeetingId,
            relations.seriesId,
            input.reminderMode,
          );

        if (relations.originMeetingId) {
          db.prepare("INSERT OR IGNORE INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)").run(
            relations.originMeetingId,
            Number(result.lastInsertRowid),
          );
        }

        const created = getTaskByPublicId(db, config, publicId);
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

  router.get("/:publicId/audit", (req, res) => {
    res.json({ auditEvents: getAuditEvents(db, "task", req.params.publicId) });
  });

  router.get("/:publicId", (req, res, next) => {
    try {
      res.json({ task: getTaskByPublicId(db, config, req.params.publicId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, taskInputSchema);
      const task = withTransaction(db, () => {
        const existing = db
          .prepare("SELECT id FROM tasks WHERE public_id = ? AND archived_at IS NULL")
          .get(req.params.publicId) as { id: number } | undefined;
        if (!existing) throw notFound("Task not found");
        const before = getTaskByPublicId(db, config, req.params.publicId);

        const relations = resolveRelations(db, input);
        db.prepare(
          `UPDATE tasks
           SET description = ?,
               assignee_person_id = ?,
               status = ?,
               due_date = ?,
               origin_meeting_id = ?,
               series_id = ?,
               reminder_mode = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          input.description,
          relations.assigneePersonId,
          input.status,
          input.dueDate ?? null,
          relations.originMeetingId,
          relations.seriesId,
          input.reminderMode,
          existing.id,
        );

        db.prepare("DELETE FROM meeting_tasks WHERE task_id = ?").run(existing.id);
        if (relations.originMeetingId) {
          db.prepare("INSERT INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)").run(
            relations.originMeetingId,
            existing.id,
          );
        }

        const updated = getTaskByPublicId(db, config, req.params.publicId);
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
        const before = getTaskByPublicId(db, config, req.params.publicId);
        const result = db
          .prepare(
            `UPDATE tasks
             SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .run(req.params.publicId);

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
