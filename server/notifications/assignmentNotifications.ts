import type { AppDatabase } from "../db/database.js";

type AssignmentUserRow = {
  id: number;
};

export function recordTaskAssignmentNotification(
  db: AppDatabase,
  input: {
    taskId: number;
    assigneePersonId: number | null;
    actorUserId: number | null;
    teamId: number;
  },
) {
  if (!input.assigneePersonId) return;

  const assigneeUser = db
    .prepare(
      `SELECT users.id
       FROM people
       JOIN users ON lower(users.email) = lower(people.email)
       WHERE people.id = ?
       AND users.team_id = ?
       AND people.email IS NOT NULL
       AND people.email <> ''
       LIMIT 1`,
    )
    .get(input.assigneePersonId, input.teamId) as AssignmentUserRow | undefined;

  if (!assigneeUser || assigneeUser.id === input.actorUserId) return;

  db.prepare(
    `INSERT INTO task_assignment_notifications
     (user_id, task_id, triggered_by_user_id)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, task_id) DO UPDATE SET
       triggered_by_user_id = excluded.triggered_by_user_id,
       read_at = NULL,
       pushed_at = NULL,
       created_at = CURRENT_TIMESTAMP`,
  ).run(assigneeUser.id, input.taskId, input.actorUserId);
}
