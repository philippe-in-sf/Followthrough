import type { AppDatabase } from "../db/database.js";

export function linkOpenSeriesTasksToMeeting(
  db: AppDatabase,
  seriesId: number,
  meetingId: number,
) {
  const tasks = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE series_id = ?
       AND status <> 'Done'
       AND archived_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    )
    .all(seriesId) as Array<{ id: number }>;

  for (const task of tasks) {
    db.prepare(
      "INSERT OR IGNORE INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)",
    ).run(meetingId, task.id);
  }
}
