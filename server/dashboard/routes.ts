import { Router } from "express";
import type { TaskStatus } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { getTaskAlert } from "../tasks/alerts.js";
import { buildWorkspaceDigestMarkdown, getDashboardTrendCounts } from "./report.js";

type DashboardTaskRow = {
  public_id: string;
  description: string;
  blockers: string;
  blockers_cleared_at: string | null;
  status: TaskStatus;
  due_date: string | null;
  private: number;
  assignee_public_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
};

type DashboardMeeting = {
  publicId: string;
  title: string;
  startsAt: string;
  blockers: string;
  blockersClearedAt: string | null;
};

export function dashboardRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = req.user?.id ?? 0;
    const teamId = req.user?.teamId ?? 0;
    const taskRows = db
      .prepare(
        `SELECT tasks.public_id, tasks.description, tasks.blockers, tasks.blockers_cleared_at,
                tasks.status, tasks.due_date,
                tasks.private,
                people.public_id AS assignee_public_id,
                people.first_name AS assignee_first_name,
                people.last_name AS assignee_last_name,
                people.name AS assignee_name,
                people.email AS assignee_email
         FROM tasks
         LEFT JOIN people ON people.id = tasks.assignee_person_id
         WHERE tasks.archived_at IS NULL
         AND tasks.team_id = ?
         AND tasks.status NOT IN ('Done', 'Won''t Fix')
         AND (tasks.private = 0 OR tasks.created_by_user_id = ?)
         ORDER BY tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC`,
      )
      .all(teamId, userId) as DashboardTaskRow[];

    const tasks = taskRows.map((row) => ({
      publicId: row.public_id,
      description: row.description,
      blockers: row.blockers,
      blockersClearedAt: row.blockers_cleared_at,
      status: row.status,
      dueDate: row.due_date,
      private: row.private === 1,
      assignee: row.assignee_public_id
        ? {
            publicId: row.assignee_public_id,
            firstName: row.assignee_first_name ?? "",
            lastName: row.assignee_last_name ?? "",
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
        `SELECT public_id AS publicId, title, starts_at AS startsAt,
                blockers, blockers_cleared_at AS blockersClearedAt
         FROM meetings
         WHERE archived_at IS NULL
         AND team_id = ?
         AND (private = 0 OR created_by_user_id = ?)
         ORDER BY starts_at DESC
         LIMIT 5`,
      )
      .all(teamId, userId) as DashboardMeeting[];

    const activeBlockerMeetings = db
      .prepare(
        `SELECT public_id AS publicId, title, starts_at AS startsAt,
                blockers, blockers_cleared_at AS blockersClearedAt
         FROM meetings
         WHERE archived_at IS NULL
         AND team_id = ?
         AND TRIM(blockers) <> ''
         AND blockers_cleared_at IS NULL
         AND (private = 0 OR created_by_user_id = ?)
         ORDER BY starts_at DESC
         LIMIT 8`,
      )
      .all(teamId, userId) as DashboardMeeting[];

    const recentDecisions = db
      .prepare(
        `SELECT public_id AS publicId, decision_text AS decisionText,
                decision_date AS decisionDate
         FROM decisions
         WHERE archived_at IS NULL
         AND team_id = ?
         ORDER BY decision_date DESC, created_at DESC
         LIMIT 5`,
      )
      .all(teamId);

    const series = db
      .prepare(
        `SELECT public_id AS publicId, title, cadence_label AS cadenceLabel
         FROM meeting_series
         WHERE team_id = ?
         AND archived_at IS NULL AND active = 1
         ORDER BY title COLLATE NOCASE
         LIMIT 8`,
      )
      .all(teamId);

    res.json({
      alerts: {
        overdue: tasks.filter((task) => task.alert === "overdue"),
        dueSoon: tasks.filter((task) => task.alert === "dueSoon"),
      },
      openTasksByAssignee: Array.from(grouped.values()),
      activeBlockers: {
        tasks: tasks.filter(
          (task) => task.blockers.trim() && task.blockersClearedAt === null,
        ),
        meetings: activeBlockerMeetings,
      },
      recentMeetings,
      recentDecisions,
      activeSeries: series,
      trends: getDashboardTrendCounts(db, userId, teamId),
    });
  });

  router.get("/export", (req, res) => {
    const userId = req.user?.id ?? 0;
    const teamId = req.user?.teamId ?? 0;
    const format = req.query.format === "text" ? "text" : "markdown";
    const report = buildWorkspaceDigestMarkdown(db, config, {
      userId,
      teamId,
      userName: req.user?.name,
    });

    res.type(format === "text" ? "text/plain" : "text/markdown").send(report);
  });

  return router;
}
