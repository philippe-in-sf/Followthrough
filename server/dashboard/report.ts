import type { TaskStatus } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import type { EmailMessage } from "../email/mailer.js";
import { getTaskAlert } from "../tasks/alerts.js";

export type DashboardTrendCounts = {
  tasksCompletedThisWeek: number;
  tasksCompletedThisMonth: number;
  decisionsMadeThisMonth: number;
  meetingsHeldThisMonth: number;
};

type ReportTaskRow = {
  public_id: string;
  description: string;
  status: TaskStatus;
  due_date: string | null;
  assignee_name: string | null;
  private: number;
};

type ReportMeetingRow = {
  public_id: string;
  title: string;
  starts_at: string;
};

type ReportDecisionRow = {
  public_id: string;
  decision_text: string;
  decision_date: string;
};

type ReportContext = {
  userId: number;
  teamId: number;
  userName?: string;
  now?: Date;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = start.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

function startOfUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function getDashboardTrendCounts(
  db: AppDatabase,
  userId: number,
  teamId: number,
  now = new Date(),
): DashboardTrendCounts {
  const weekStart = startOfUtcWeek(now).toISOString();
  const weekEnd = addUtcDays(startOfUtcWeek(now), 7).toISOString();
  const monthStart = startOfUtcMonth(now).toISOString();
  const nextMonthStart = addUtcMonths(startOfUtcMonth(now), 1).toISOString();

  const tasksCompletedThisWeek = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tasks
       WHERE team_id = ?
       AND archived_at IS NULL
       AND status IN ('Done', 'Won''t Fix')
       AND updated_at >= ?
       AND updated_at < ?
       AND (private = 0 OR created_by_user_id = ?)`,
    )
    .get(teamId, weekStart, weekEnd, userId) as { count: number };

  const tasksCompletedThisMonth = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tasks
       WHERE team_id = ?
       AND archived_at IS NULL
       AND status IN ('Done', 'Won''t Fix')
       AND updated_at >= ?
       AND updated_at < ?
       AND (private = 0 OR created_by_user_id = ?)`,
    )
    .get(teamId, monthStart, nextMonthStart, userId) as { count: number };

  const decisionsMadeThisMonth = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM decisions
       WHERE team_id = ?
       AND archived_at IS NULL
       AND decision_date >= ?
       AND decision_date < ?`,
    )
    .get(teamId, isoDate(startOfUtcMonth(now)), isoDate(addUtcMonths(startOfUtcMonth(now), 1))) as {
    count: number;
  };

  const meetingsHeldThisMonth = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM meetings
       WHERE team_id = ?
       AND archived_at IS NULL
       AND starts_at >= ?
       AND starts_at < ?
       AND (private = 0 OR created_by_user_id = ?)`,
    )
    .get(teamId, monthStart, nextMonthStart, userId) as { count: number };

  return {
    tasksCompletedThisWeek: Number(tasksCompletedThisWeek.count),
    tasksCompletedThisMonth: Number(tasksCompletedThisMonth.count),
    decisionsMadeThisMonth: Number(decisionsMadeThisMonth.count),
    meetingsHeldThisMonth: Number(meetingsHeldThisMonth.count),
  };
}

function taskLine(task: ReportTaskRow) {
  const assignee = task.assignee_name ?? "Unassigned";
  const dueDate = task.due_date ? `, due ${task.due_date}` : "";
  const privateLabel = task.private === 1 ? ", private" : "";
  return `- ${task.public_id}: ${task.description} (${task.status}, ${assignee}${dueDate}${privateLabel})`;
}

function getOpenTasks(db: AppDatabase, config: AppConfig, context: ReportContext) {
  const rows = db
    .prepare(
      `SELECT tasks.public_id, tasks.description, tasks.status, tasks.due_date,
              tasks.private, people.name AS assignee_name
       FROM tasks
       LEFT JOIN people ON people.id = tasks.assignee_person_id
       WHERE tasks.team_id = ?
       AND tasks.archived_at IS NULL
       AND tasks.status NOT IN ('Done', 'Won''t Fix')
       AND (tasks.private = 0 OR tasks.created_by_user_id = ?)
       ORDER BY tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC
       LIMIT 12`,
    )
    .all(context.teamId, context.userId) as ReportTaskRow[];

  const overdue = rows.filter(
    (task) => getTaskAlert(task.due_date, task.status, config.dueSoonDays, context.now) === "overdue",
  );
  const dueSoon = rows.filter(
    (task) => getTaskAlert(task.due_date, task.status, config.dueSoonDays, context.now) === "dueSoon",
  );

  return { rows, overdue, dueSoon };
}

function getRecentMeetings(db: AppDatabase, context: ReportContext, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT public_id, title, starts_at
       FROM meetings
       WHERE team_id = ?
       AND archived_at IS NULL
       AND starts_at >= ?
       AND starts_at < ?
       AND (private = 0 OR created_by_user_id = ?)
       ORDER BY starts_at DESC
       LIMIT 8`,
    )
    .all(context.teamId, start.toISOString(), end.toISOString(), context.userId) as ReportMeetingRow[];
}

function getRecentDecisions(db: AppDatabase, context: ReportContext, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT public_id, decision_text, decision_date
       FROM decisions
       WHERE team_id = ?
       AND archived_at IS NULL
       AND decision_date >= ?
       AND decision_date < ?
       ORDER BY decision_date DESC, created_at DESC
       LIMIT 8`,
    )
    .all(context.teamId, isoDate(start), isoDate(end)) as ReportDecisionRow[];
}

function linesOrEmpty<T>(items: T[], render: (item: T) => string, empty: string) {
  return items.length > 0 ? items.map(render) : [`- ${empty}`];
}

export function buildWorkspaceDigestMarkdown(
  db: AppDatabase,
  config: AppConfig,
  context: ReportContext,
) {
  const now = context.now ?? new Date();
  const weekStart = startOfUtcWeek(now);
  const weekEnd = addUtcDays(weekStart, 7);
  const trends = getDashboardTrendCounts(db, context.userId, context.teamId, now);
  const openTasks = getOpenTasks(db, config, { ...context, now });
  const meetings = getRecentMeetings(db, context, weekStart, weekEnd);
  const decisions = getRecentDecisions(db, context, weekStart, weekEnd);
  const title = `Followthrough weekly digest: ${isoDate(weekStart)} to ${isoDate(addUtcDays(weekEnd, -1))}`;

  return [
    `# ${title}`,
    "",
    context.userName ? `For ${context.userName}.` : "",
    "",
    "## Momentum",
    `- Tasks completed this week: ${trends.tasksCompletedThisWeek}`,
    `- Tasks completed this month: ${trends.tasksCompletedThisMonth}`,
    `- Decisions made this month: ${trends.decisionsMadeThisMonth}`,
    `- Meetings held this month: ${trends.meetingsHeldThisMonth}`,
    "",
    "## Needs attention",
    `- Overdue tasks: ${openTasks.overdue.length}`,
    `- Due soon tasks: ${openTasks.dueSoon.length}`,
    "",
    "## Open tasks",
    ...linesOrEmpty(openTasks.rows, taskLine, "No open tasks."),
    "",
    "## Meetings this week",
    ...linesOrEmpty(
      meetings,
      (meeting) => `- ${meeting.public_id}: ${meeting.title} (${isoDate(new Date(meeting.starts_at))})`,
      "No meetings recorded this week.",
    ),
    "",
    "## Decisions this week",
    ...linesOrEmpty(
      decisions,
      (decision) => `- ${decision.public_id}: ${decision.decision_text} (${decision.decision_date})`,
      "No decisions recorded this week.",
    ),
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

export function buildWorkspaceDigestEmail(
  db: AppDatabase,
  config: AppConfig,
  context: ReportContext & { recipientEmail: string },
): EmailMessage {
  const now = context.now ?? new Date();
  const weekStart = startOfUtcWeek(now);
  const weekEnd = addUtcDays(weekStart, 7);
  return {
    to: context.recipientEmail,
    subject: `Followthrough weekly digest: ${isoDate(weekStart)} to ${isoDate(addUtcDays(weekEnd, -1))}`,
    text: buildWorkspaceDigestMarkdown(db, config, context),
  };
}

export function currentDigestPeriod(now = new Date()) {
  const start = startOfUtcWeek(now);
  const end = addUtcDays(start, 7);
  return { start: start.toISOString(), end: end.toISOString() };
}
