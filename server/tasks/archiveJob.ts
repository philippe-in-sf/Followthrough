import { recordAuditEvent } from "../audit/auditLog.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { withTransaction } from "../db/ids.js";

type ClosedTaskStatus = "Done" | "Won't Fix";

type StaleTaskRow = {
  id: number;
  public_id: string;
  status: ClosedTaskStatus;
  status_changed_at: string | null;
};

export type TaskAutoArchiveResult = {
  archivedTaskPublicIds: string[];
};

export type TaskAutoArchiveJob = {
  stop(): void;
};

export function archiveStaleClosedTasks(
  db: AppDatabase,
  config: Pick<AppConfig, "taskAutoArchiveAfterDays">,
  now = new Date(),
): TaskAutoArchiveResult {
  const retentionDays = Number.isFinite(config.taskAutoArchiveAfterDays)
    ? Math.max(1, config.taskAutoArchiveAfterDays)
    : 14;
  const archivedAt = now.toISOString();
  const cutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  return withTransaction(db, () => {
    const staleTasks = db
      .prepare(
        `SELECT id, public_id, status, status_changed_at
         FROM tasks
         WHERE archived_at IS NULL
           AND status IN ('Done', 'Won''t Fix')
           AND datetime(COALESCE(status_changed_at, updated_at, created_at)) <= datetime(?)
         ORDER BY id`,
      )
      .all(cutoff) as StaleTaskRow[];
    const archivedTaskPublicIds: string[] = [];
    const archiveTask = db.prepare(
      `UPDATE tasks
       SET archived_at = ?, updated_at = ?
       WHERE id = ? AND archived_at IS NULL`,
    );

    for (const task of staleTasks) {
      const result = archiveTask.run(archivedAt, archivedAt, task.id);
      if (result.changes === 0) continue;

      recordAuditEvent(db, {
        entityType: "task",
        entityPublicId: task.public_id,
        action: "auto_archived",
        userId: null,
        summary: `Archived automatically after ${retentionDays} days in ${task.status}`,
        changes: {
          archivedAt,
          status: task.status,
          statusChangedAt: task.status_changed_at,
          retentionDays,
        },
      });
      archivedTaskPublicIds.push(task.public_id);
    }

    return { archivedTaskPublicIds };
  });
}

export function startTaskAutoArchiveJob(
  db: AppDatabase,
  config: AppConfig,
): TaskAutoArchiveJob {
  function run() {
    try {
      const result = archiveStaleClosedTasks(db, config);
      if (result.archivedTaskPublicIds.length > 0) {
        console.log(
          `Automatically archived ${result.archivedTaskPublicIds.length} closed task(s)`,
        );
      }
    } catch (error) {
      console.error("Automatic closed-task archival failed", error);
    }
  }

  run();
  const configuredIntervalMs = Number.isFinite(config.taskAutoArchiveIntervalMs)
    ? config.taskAutoArchiveIntervalMs
    : 86_400_000;
  const timer = setInterval(run, Math.max(60_000, configuredIntervalMs));

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
