import type { TaskReminderMode, TaskStatus } from "../../shared/types.js";
import { recordAuditEvent } from "../audit/auditLog.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import type { EmailMessage, EmailSender } from "../email/mailer.js";
import { getTaskAlert } from "./alerts.js";

type ReminderTaskRow = {
  id: number;
  public_id: string;
  description: string;
  status: TaskStatus;
  due_date: string | null;
  reminder_mode: TaskReminderMode;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_archived_at: string | null;
  last_automatic_reminder_sent_at: string | null;
};

export type TaskReminderSendResult = {
  taskPublicId: string;
  recipientEmail: string;
  mode: TaskReminderMode;
  subject: string;
  sentAt: string;
};

export type AutomaticTaskReminderRunResult = {
  sent: TaskReminderSendResult[];
  skipped: Array<{ taskPublicId: string; reason: string }>;
};

const reminderTaskSelect = `
  SELECT tasks.id, tasks.public_id, tasks.description, tasks.status, tasks.due_date,
         tasks.reminder_mode,
         people.name AS assignee_name,
         people.email AS assignee_email,
         people.archived_at AS assignee_archived_at,
         (
           SELECT MAX(sent_at)
           FROM task_reminder_events
           WHERE task_reminder_events.task_id = tasks.id
           AND task_reminder_events.mode = 'automatic'
         ) AS last_automatic_reminder_sent_at
  FROM tasks
  LEFT JOIN people ON people.id = tasks.assignee_person_id
`;

function assertEmailSender(emailSender: EmailSender | null | undefined) {
  if (!emailSender) throw new HttpError(503, "Email reminders are not configured");
  return emailSender;
}

function getOutstandingTaskForReminder(db: AppDatabase, publicId: string) {
  const row = db
    .prepare(
      `${reminderTaskSelect}
       WHERE tasks.public_id = ?
       AND tasks.archived_at IS NULL
       AND tasks.status NOT IN ('Done', 'Won''t Fix')`,
    )
    .get(publicId) as ReminderTaskRow | undefined;

  if (!row) throw notFound("Outstanding task not found");
  return row;
}

function requireActiveAssigneeEmail(row: ReminderTaskRow) {
  if (!row.assignee_email || row.assignee_archived_at !== null) {
    throw badRequest("Task reminders require an active assignee with an email address");
  }

  return row.assignee_email;
}

function reminderSubject(row: ReminderTaskRow, config: AppConfig) {
  const alert = getTaskAlert(row.due_date, row.status, config.dueSoonDays);
  if (alert === "overdue") return `Followthrough: Task ${row.public_id} is overdue`;
  if (alert === "dueSoon") return `Followthrough: Task ${row.public_id} is due soon`;
  return `Followthrough: Task ${row.public_id} reminder`;
}

function appAccessUrl(config: AppConfig) {
  const baseUrl = config.appBaseUrl || "https://followthrough.dev";

  try {
    return new URL(baseUrl).toString().replace(/\/$/, "");
  } catch {
    return baseUrl.replace(/\/+$/, "");
  }
}

function buildTaskReminderEmail(row: ReminderTaskRow, config: AppConfig): EmailMessage {
  const recipient = requireActiveAssigneeEmail(row);
  const dueDate = row.due_date ?? "No due date";
  const greeting = row.assignee_name ? `Hi ${row.assignee_name},` : "Hi,";
  const accessUrl = appAccessUrl(config);

  return {
    to: recipient,
    subject: reminderSubject(row, config),
    text: [
      greeting,
      "",
      `Just a reminder that Philippe will want to talk about a task assigned to you soon.  The notes that this humble computer has say: ${row.description} (task number: ${row.public_id}).   The status is currently set as ${row.status}, with a due date of ${dueDate}.`,
      "",
      "If you have any questions, please see Philippe.",
      "",
      `To manually manage tasks, ask for access to ${accessUrl}.`,
    ].join("\n"),
  };
}

async function sendTaskReminderForRow(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender,
  row: ReminderTaskRow,
  mode: TaskReminderMode,
  userId: number | null,
  now = new Date(),
): Promise<TaskReminderSendResult> {
  const message = buildTaskReminderEmail(row, config);
  await emailSender.send(message);

  const sentAt = now.toISOString();
  db.prepare(
    `INSERT INTO task_reminder_events (task_id, mode, recipient_email, subject, sent_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(row.id, mode, message.to, message.subject, sentAt);

  recordAuditEvent(db, {
    entityType: "task",
    entityPublicId: row.public_id,
    action: "reminder_sent",
    userId,
    summary: `Sent ${mode} reminder to ${row.assignee_name ?? message.to}`,
    changes: {
      mode,
      recipientEmail: message.to,
      subject: message.subject,
      sentAt,
    },
  });

  return {
    taskPublicId: row.public_id,
    recipientEmail: message.to,
    mode,
    subject: message.subject,
    sentAt,
  };
}

function wasAutomaticReminderSentToday(row: ReminderTaskRow, now: Date) {
  return row.last_automatic_reminder_sent_at?.slice(0, 10) === now.toISOString().slice(0, 10);
}

export async function sendManualTaskReminder(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null | undefined,
  publicId: string,
  userId: number | null,
  now = new Date(),
) {
  const sender = assertEmailSender(emailSender);
  const row = getOutstandingTaskForReminder(db, publicId);
  requireActiveAssigneeEmail(row);
  return sendTaskReminderForRow(db, config, sender, row, "manual", userId, now);
}

export async function sendAutomaticTaskReminders(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null | undefined,
  now = new Date(),
): Promise<AutomaticTaskReminderRunResult> {
  const sender = assertEmailSender(emailSender);
  const rows = db
    .prepare(
      `${reminderTaskSelect}
       WHERE tasks.archived_at IS NULL
       AND tasks.status NOT IN ('Done', 'Won''t Fix')
       AND tasks.reminder_mode = 'automatic'
       AND tasks.due_date IS NOT NULL
       AND people.email IS NOT NULL
       AND people.archived_at IS NULL
       ORDER BY tasks.due_date ASC, tasks.created_at ASC`,
    )
    .all() as ReminderTaskRow[];

  const result: AutomaticTaskReminderRunResult = { sent: [], skipped: [] };

  for (const row of rows) {
    const alert = getTaskAlert(row.due_date, row.status, config.dueSoonDays, now);
    if (!alert) {
      result.skipped.push({ taskPublicId: row.public_id, reason: "not_due_yet" });
      continue;
    }

    if (wasAutomaticReminderSentToday(row, now)) {
      result.skipped.push({ taskPublicId: row.public_id, reason: "already_sent_today" });
      continue;
    }

    result.sent.push(await sendTaskReminderForRow(db, config, sender, row, "automatic", null, now));
  }

  return result;
}
