import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { getTaskAlert } from "../tasks/alerts.js";

type DashboardTaskRow = {
  public_id: string;
  description: string;
  status: "Open" | "In Progress" | "Blocked" | "Done";
  due_date: string | null;
  assignee_public_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
};

export function dashboardRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get("/", (_req, res) => {
    const taskRows = db
      .prepare(
        `SELECT tasks.public_id, tasks.description, tasks.status, tasks.due_date,
                people.public_id AS assignee_public_id,
                people.name AS assignee_name,
                people.email AS assignee_email
         FROM tasks
         LEFT JOIN people ON people.id = tasks.assignee_person_id
         WHERE tasks.archived_at IS NULL AND tasks.status <> 'Done'
         ORDER BY tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC`,
      )
      .all() as DashboardTaskRow[];

    const tasks = taskRows.map((row) => ({
      publicId: row.public_id,
      description: row.description,
      status: row.status,
      dueDate: row.due_date,
      assignee: row.assignee_public_id
        ? {
            publicId: row.assignee_public_id,
            name: row.assignee_name ?? "",
            email: row.assignee_email,
            archived: false,
          }
        : null,
      alert: getTaskAlert(row.due_date, row.status, config.dueSoonDays),
    }));

    const grouped = new Map<
      string,
      { assignee: (typeof tasks)[number]["assignee"]; tasks: typeof tasks }
    >();
    for (const task of tasks) {
      const key = task.assignee?.publicId ?? "unassigned";
      if (!grouped.has(key)) grouped.set(key, { assignee: task.assignee, tasks: [] });
      grouped.get(key)?.tasks.push(task);
    }

    const recentMeetings = db
      .prepare(
        `SELECT public_id AS publicId, title, starts_at AS startsAt
         FROM meetings
         WHERE archived_at IS NULL
         ORDER BY starts_at DESC
         LIMIT 5`,
      )
      .all();

    const recentDecisions = db
      .prepare(
        `SELECT public_id AS publicId, decision_text AS decisionText,
                decision_date AS decisionDate
         FROM decisions
         WHERE archived_at IS NULL
         ORDER BY decision_date DESC, created_at DESC
         LIMIT 5`,
      )
      .all();

    const series = db
      .prepare(
        `SELECT public_id AS publicId, title, cadence_label AS cadenceLabel
         FROM meeting_series
         WHERE archived_at IS NULL AND active = 1
         ORDER BY title COLLATE NOCASE
         LIMIT 8`,
      )
      .all();

    res.json({
      alerts: {
        overdue: tasks.filter((task) => task.alert === "overdue"),
        dueSoon: tasks.filter((task) => task.alert === "dueSoon"),
      },
      openTasksByAssignee: Array.from(grouped.values()),
      recentMeetings,
      recentDecisions,
      activeSeries: series,
    });
  });

  return router;
}
