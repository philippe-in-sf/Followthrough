import { Router } from "express";
import { taskInputSchema, taskUpdateInputSchema } from "../../shared/schemas.js";
import type { TaskStatus } from "../../shared/types.js";
import { getAuditEvents, recordAuditEvent } from "../audit/auditLog.js";
import { resolveBlockerClearedAt } from "../blockers.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import type { EmailSender } from "../email/mailer.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { recordTaskAssignmentNotification } from "../notifications/assignmentNotifications.js";
import { parseBody } from "../validation.js";
import { sendManualTaskReminder } from "./reminders.js";
import { getTaskDependencyMap, mapTaskRow, mapTaskRows, taskSelect, type TaskRow } from "./taskRows.js";

type ResolvedTaskRelations = {
  assigneePersonId: number | null;
  originMeetingId: number | null;
  originDecisionId: number | null;
  seriesId: number | null;
};

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
    originDecisionPublicId?: string | null;
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

  const decision = input.originDecisionPublicId
    ? (db
        .prepare(
          `SELECT id
           FROM decisions
           WHERE public_id = ?
           AND team_id = ?
           AND archived_at IS NULL`,
        )
        .get(input.originDecisionPublicId, teamId) as { id: number } | undefined)
    : null;

  if (input.originDecisionPublicId && !decision) {
    throw badRequest("Origin decision not found");
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
    originDecisionId: decision?.id ?? null,
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
             (public_id, description, blockers, notes, blockers_cleared_at, assignee_person_id, status, due_date, origin_meeting_id, origin_decision_id, series_id, reminder_mode, private, created_by_user_id, team_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            relations.originDecisionId,
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
        recordTaskAssignmentNotification(db, {
          taskId,
          assigneePersonId: relations.assigneePersonId,
          actorUserId: userId,
          teamId,
        });

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

        if (created.originDecisionPublicId) {
          recordAuditEvent(db, {
            entityType: "decision",
            entityPublicId: created.originDecisionPublicId,
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
            `SELECT id, blockers, notes, blockers_cleared_at, created_by_user_id,
                    private, assignee_person_id
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
              assignee_person_id: number | null;
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
               origin_decision_id = ?,
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
          relations.originDecisionId,
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
        if (relations.assigneePersonId !== existing.assignee_person_id) {
          recordTaskAssignmentNotification(db, {
            taskId: existing.id,
            assigneePersonId: relations.assigneePersonId,
            actorUserId: userId,
            teamId: req.user?.teamId ?? 0,
          });
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
