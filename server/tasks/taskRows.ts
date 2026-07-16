import type { TaskDependencyDto, TaskDto, TaskReminderMode, TaskStatus } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { getTaskAlert } from "./alerts.js";

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
  origin_decision_public_id: string | null;
  series_public_id: string | null;
};

type TaskDependencyRow = {
  task_id: number;
  public_id: string;
  description: string;
  status: TaskStatus;
  archived_at: string | null;
};

export const taskSelect = `
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
         origin_decisions.public_id AS origin_decision_public_id,
         meeting_series.public_id AS series_public_id
  FROM tasks
  LEFT JOIN people ON people.id = tasks.assignee_person_id
  LEFT JOIN meetings AS origin_meetings ON origin_meetings.id = tasks.origin_meeting_id
  LEFT JOIN decisions AS origin_decisions ON origin_decisions.id = tasks.origin_decision_id
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
    originDecisionPublicId: row.origin_decision_public_id,
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
       ORDER BY dependency_tasks.status IN ('Done', 'Won''t Fix'),
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
