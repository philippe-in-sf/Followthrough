import { Router } from "express";
import { taskInputSchema, taskUpdateInputSchema } from "../../shared/schemas.js";
import type {
  TaskDependencyDto,
  TaskDto,
  TaskReminderMode,
  TaskStatus,
} from "../../shared/types.js";
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
  task_id: number;
  public_id: string;
  description: string;
  blockers: string;
  notes: string;
  blockers_cleared_at: string | null;
  status: TaskStatus;
  due_date: string | null;
  reminder_mode: TaskReminderMode;
  last_reminder_sent_at: string | null;
  private: number;
  created_by_user_id: number | null;
  archived_at: string | null;
  assignee_public_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
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

type TaskDependencyRow = {
  task_id: number;
  public_id: string;
  description: string;
  status: TaskStatus;
  archived_at: string | null;
};

const taskSelect = `
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
  FROM tasks
  LEFT JOIN people ON people.id = tasks.assignee_person_id
  LEFT JOIN meetings AS origin_meetings ON origin_meetings.id = tasks.origin_meeting_id
  LEFT JOIN meeting_series ON meeting_series.id = tasks.series_id
`;

export function mapTaskRow(
  row: TaskRow,
  config: AppConfig,
  dependencies: TaskDependencyDto[] = [],
): TaskDto {
  return {
    publicId: row.public_id,
    description: row.description,
    blockers: row.blockers,
    notes: row.notes,
    blockersClearedAt: row.blockers_cleared_at,
    assignee: row.assignee_public_id
      ? {
          publicId: row.assignee_public_id,
          firstName: row.assignee_first_name ?? "",
          lastName: row.assignee_last_name ?? "",
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
    dependencies,
    private: row.private === 1,
    archived: row.archived_at !== null,
  };
}

export function getTaskDependencyMap(
  db: AppDatabase,
  taskIds: number[],
  userId: number,
): Map<number, TaskDependencyDto[]> {
  const uniqueTaskIds = [...new Set(taskIds)];
  if (uniqueTaskIds.length === 0) return new Map();

  const placeholders = uniqueTaskIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT task_dependencies.task_id,
              dependency_tasks.public_id,
              dependency_tasks.description,
              dependency_tasks.status,
              dependency_tasks.archived_at
       FROM task_dependencies
       JOIN tasks AS parent_tasks ON parent_tasks.id = task_dependencies.task_id
       JOIN tasks AS dependency_tasks ON dependency_tasks.id = task_dependencies.depends_on_task_id
       WHERE task_dependencies.task_id IN (${placeholders})
       AND dependency_tasks.team_id = parent_tasks.team_id
       AND (dependency_tasks.private = 0 OR dependency_tasks.created_by_user_id = ?)
       ORDER BY dependency_tasks.status = 'Done',
                dependency_tasks.archived_at IS NOT NULL,
                dependency_tasks.due_date IS NULL,
                dependency_tasks.due_date ASC,
                dependency_tasks.created_at ASC`,
    )
    .all(...uniqueTaskIds, userId) as TaskDependencyRow[];

  const dependenciesByTaskId = new Map<number, TaskDependencyDto[]>();
  for (const row of rows) {
    const taskDependencies = dependenciesByTaskId.get(row.task_id) ?? [];
    taskDependencies.push({
      publicId: row.public_id,
      description: row.description,
      status: row.status,
      archived: row.archived_at !== null,
    });
    dependenciesByTaskId.set(row.task_id, taskDependencies);
  }

  return dependenciesByTaskId;
}

export function mapTaskRows(
  db: AppDatabase,
  config: AppConfig,
  rows: TaskRow[],
  userId: number,
): TaskDto[] {
  const dependenciesByTaskId = getTaskDependencyMap(
    db,
    rows.map((row) => row.task_id),
    userId,
  );
  return rows.map((row) => mapTaskRow(row, config, dependenciesByTaskId.get(row.task_id) ?? []));
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
  teamId: number,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `${taskSelect}
       WHERE tasks.public_id = ?
       AND tasks.team_id = ?
       AND ${visibleTaskCondition()}
       ${includeArchived ? "" : "AND tasks.archived_at IS NULL"}`,
    )
    .get(publicId, teamId, userId) as TaskRow | undefined;

  if (!row) throw notFound("Task not found");
  return mapTaskRow(
    row,
    config,
    getTaskDependencyMap(db, [row.task_id], userId).get(row.task_id) ?? [],
  );
}

function createsDependencyCycle(
  db: AppDatabase,
  taskId: number,
  dependencyTaskId: number,
): boolean {
  const cycle = db
    .prepare(
      `WITH RECURSIVE dependency_chain(task_id) AS (
         SELECT depends_on_task_id
         FROM task_dependencies
         WHERE task_id = ?
         UNION
         SELECT task_dependencies.depends_on_task_id
         FROM task_dependencies
         JOIN dependency_chain ON dependency_chain.task_id = task_dependencies.task_id
       )
       SELECT 1 AS found
       FROM dependency_chain
       WHERE task_id = ?
       LIMIT 1`,
    )
    .get(dependencyTaskId, taskId) as { found: number } | undefined;

  return Boolean(cycle);
}

function resolveDependencyTaskIds(
  db: AppDatabase,
  dependencyPublicIds: string[],
  userId: number,
  teamId: number,
  currentTaskId: number | null = null,
): number[] {
  const uniquePublicIds = [...new Set(dependencyPublicIds)];

  return uniquePublicIds.map((publicId) => {
    const dependency = db
      .prepare(
        `SELECT id
         FROM tasks
         WHERE public_id = ?
         AND team_id = ?
         AND (private = 0 OR created_by_user_id = ?)`,
      )
      .get(publicId, teamId, userId) as { id: number } | undefined;

    if (!dependency) throw badRequest(`Dependency task not found: ${publicId}`);
    if (currentTaskId !== null && dependency.id === currentTaskId) {
      throw badRequest("A task cannot depend on itself");
    }
    if (
      currentTaskId !== null &&
      createsDependencyCycle(db, currentTaskId, dependency.id)
    ) {
      throw badRequest(`Dependency would create a cycle: ${publicId}`);
    }

    return dependency.id;
  });
}

function replaceVisibleTaskDependencies(
  db: AppDatabase,
  taskId: number,
  dependencyTaskIds: number[],
  userId: number,
  teamId: number,
) {
  db.prepare(
    `DELETE FROM task_dependencies
     WHERE task_id = ?
     AND depends_on_task_id IN (
       SELECT id
       FROM tasks
       WHERE team_id = ?
       AND (private = 0 OR created_by_user_id = ?)
     )`,
  ).run(taskId, teamId, userId);

  const insert = db.prepare(
    "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)",
  );
  for (const dependencyTaskId of dependencyTaskIds) {
    insert.run(taskId, dependencyTaskId);
  }
}

function resolveRelations(
  db: AppDatabase,
  input: {
    assigneePublicId?: string | null;
    originMeetingPublicId?: string | null;
    seriesPublicId?: string | null;
  },
  userId: number,
  teamId: number,
): ResolvedTaskRelations {
  const assignee = input.assigneePublicId
    ? (db
        .prepare(
          "SELECT id FROM people WHERE public_id = ? AND team_id = ? AND archived_at IS NULL",
        )
        .get(input.assigneePublicId, teamId) as { id: number } | undefined)
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
           AND team_id = ?
           AND (private = 0 OR created_by_user_id = ?)
           AND archived_at IS NULL`,
        )
        .get(input.originMeetingPublicId, teamId, userId) as
        | { id: number; series_id: number | null }
        | undefined)
    : null;

  if (input.originMeetingPublicId && !meeting) {
    throw badRequest("Origin meeting not found");
  }

  const explicitSeries = input.seriesPublicId
    ? (db
        .prepare(
          "SELECT id FROM meeting_series WHERE public_id = ? AND team_id = ? AND archived_at IS NULL",
        )
        .get(input.seriesPublicId, teamId) as { id: number } | undefined)
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
    const conditions = [
      req.query.archived === "true"
        ? "tasks.archived_at IS NOT NULL"
        : "tasks.archived_at IS NULL",
      visibleTaskCondition(),
    ];
    const params: Array<string | number> = [req.user?.teamId ?? 0, userId];
    conditions.unshift("tasks.team_id = ?");

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

    let tasks = mapTaskRows(db, config, rows, userId);
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
        const teamId = req.user?.teamId ?? 0;
        const relations = resolveRelations(db, input, userId, teamId);
        const dependencyTaskIds = resolveDependencyTaskIds(
          db,
          input.dependencyPublicIds,
          userId,
          teamId,
        );
        const publicId = nextPublicId(db, "T");
        const blockersClearedAt = resolveBlockerClearedAt({
          blockers: input.blockers,
          requestedCleared: input.blockersCleared,
        });
        const result = db
          .prepare(
            `INSERT INTO tasks
             (public_id, description, blockers, notes, blockers_cleared_at, assignee_person_id, status, due_date, origin_meeting_id, series_id, reminder_mode, private, created_by_user_id, team_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            publicId,
            input.description,
            input.blockers,
            input.notes,
            blockersClearedAt,
            relations.assigneePersonId,
            input.status,
            input.dueDate ?? null,
            relations.originMeetingId,
            relations.seriesId,
            input.reminderMode,
            input.private ? 1 : 0,
            userId,
            teamId,
          );
        const taskId = Number(result.lastInsertRowid);
        replaceVisibleTaskDependencies(db, taskId, dependencyTaskIds, userId, teamId);

        if (relations.originMeetingId) {
          db.prepare("INSERT OR IGNORE INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)").run(
            relations.originMeetingId,
            taskId,
          );
        }

        const created = getTaskByPublicId(db, config, publicId, userId, teamId);
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
      getTaskByPublicId(
        db,
        config,
        req.params.publicId,
        req.user?.id ?? 0,
        req.user?.teamId ?? 0,
        true,
      );
      res.json({ auditEvents: getAuditEvents(db, "task", req.params.publicId) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId", (req, res, next) => {
    try {
      res.json({
        task: getTaskByPublicId(
          db,
          config,
          req.params.publicId,
          req.user?.id ?? 0,
          req.user?.teamId ?? 0,
        ),
      });
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
            `SELECT id, blockers, notes, blockers_cleared_at, created_by_user_id, private
             FROM tasks
             WHERE public_id = ?
             AND team_id = ?
             AND ${visibleTaskCondition()}
             AND archived_at IS NULL`,
          )
          .get(req.params.publicId, req.user?.teamId ?? 0, userId) as
          | {
              id: number;
              blockers: string;
              notes: string;
              blockers_cleared_at: string | null;
              created_by_user_id: number | null;
              private: number;
            }
          | undefined;
        if (!existing) throw notFound("Task not found");
        if (input.private && !canMakePrivate(existing.created_by_user_id, userId)) {
          throw badRequest("Only the creator can make this task private");
        }
        const before = getTaskByPublicId(
          db,
          config,
          req.params.publicId,
          userId,
          req.user?.teamId ?? 0,
        );

        const relations = resolveRelations(db, input, userId, req.user?.teamId ?? 0);
        const dependencyTaskIds = resolveDependencyTaskIds(
          db,
          input.dependencyPublicIds,
          userId,
          req.user?.teamId ?? 0,
          existing.id,
        );
        const createdByUserId =
          input.private && existing.created_by_user_id === null
            ? userId
            : existing.created_by_user_id;
        const blockers = input.blockers ?? existing.blockers;
        const notes = input.notes ?? existing.notes;
        const blockersClearedAt = resolveBlockerClearedAt({
          blockers,
          requestedCleared: input.blockersCleared,
          existingClearedAt: existing.blockers_cleared_at,
        });
        db.prepare(
          `UPDATE tasks
           SET description = ?,
               blockers = ?,
               notes = ?,
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
          notes,
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
        replaceVisibleTaskDependencies(
          db,
          existing.id,
          dependencyTaskIds,
          userId,
          req.user?.teamId ?? 0,
        );

        const updated = getTaskByPublicId(
          db,
          config,
          req.params.publicId,
          userId,
          req.user?.teamId ?? 0,
        );
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
      getTaskByPublicId(
        db,
        config,
        req.params.publicId,
        req.user?.id ?? 0,
        req.user?.teamId ?? 0,
      );
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
        const before = getTaskByPublicId(
          db,
          config,
          req.params.publicId,
          userId,
          req.user?.teamId ?? 0,
        );
        const result = db
          .prepare(
            `UPDATE tasks
             SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ?
             AND team_id = ?
             AND (private = 0 OR created_by_user_id = ?)
             AND archived_at IS NULL`,
          )
          .run(req.params.publicId, req.user?.teamId ?? 0, userId);

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

  router.post("/:publicId/restore", (req, res, next) => {
    try {
      const task = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const before = getTaskByPublicId(
          db,
          config,
          req.params.publicId,
          userId,
          req.user?.teamId ?? 0,
          true,
        );
        if (!before.archived) throw badRequest("Task is not archived");

        const result = db
          .prepare(
            `UPDATE tasks
             SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ?
             AND team_id = ?
             AND (private = 0 OR created_by_user_id = ?)
             AND archived_at IS NOT NULL`,
          )
          .run(req.params.publicId, req.user?.teamId ?? 0, userId);

        if (result.changes === 0) throw notFound("Task not found");
        const after = getTaskByPublicId(
          db,
          config,
          req.params.publicId,
          userId,
          req.user?.teamId ?? 0,
        );
        recordAuditEvent(db, {
          entityType: "task",
          entityPublicId: after.publicId,
          action: "restored",
          userId: req.user?.id ?? null,
          summary: "Restored task",
          changes: { before, after },
        });
        return after;
      });

      res.json({ task });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
