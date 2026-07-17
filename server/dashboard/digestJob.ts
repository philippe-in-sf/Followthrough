import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import type { EmailSender } from "../email/mailer.js";
import { buildWorkspaceDigestEmail, currentDigestPeriod } from "./report.js";

export type WorkspaceDigestJob = {
  stop(): void;
};

type DigestUserRow = {
  user_id: number;
  team_id: number;
  name: string;
  email: string;
};

export type WorkspaceDigestRunResult = {
  sent: Array<{ userId: number; recipientEmail: string; subject: string; sentAt: string }>;
  skipped: Array<{ userId: number; reason: string }>;
};

function optedInDigestUsers(db: AppDatabase) {
  return db
    .prepare(
      `SELECT users.id AS user_id, users.team_id, users.name, users.email
       FROM users
       JOIN user_preferences ON user_preferences.user_id = users.id
       WHERE user_preferences.weekly_digest_enabled = 1
       AND users.email <> ''
       AND users.team_id IS NOT NULL
       ORDER BY users.id ASC`,
    )
    .all() as DigestUserRow[];
}

function alreadySentDigest(
  db: AppDatabase,
  userId: number,
  periodStart: string,
  periodEnd: string,
) {
  return Boolean(
    db
      .prepare(
        `SELECT id
         FROM digest_email_events
         WHERE user_id = ?
         AND period_start = ?
         AND period_end = ?
         LIMIT 1`,
      )
      .get(userId, periodStart, periodEnd),
  );
}

export async function sendWeeklyWorkspaceDigests(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null | undefined,
  now = new Date(),
): Promise<WorkspaceDigestRunResult> {
  const result: WorkspaceDigestRunResult = { sent: [], skipped: [] };
  if (!emailSender) return result;

  const period = currentDigestPeriod(now);
  for (const user of optedInDigestUsers(db)) {
    if (alreadySentDigest(db, user.user_id, period.start, period.end)) {
      result.skipped.push({ userId: user.user_id, reason: "already_sent_this_week" });
      continue;
    }

    const message = buildWorkspaceDigestEmail(db, config, {
      userId: user.user_id,
      teamId: user.team_id,
      userName: user.name,
      recipientEmail: user.email,
      now,
    });
    await emailSender.send(message);

    const sentAt = now.toISOString();
    db.prepare(
      `INSERT INTO digest_email_events (
         user_id, team_id, period_start, period_end, recipient_email, subject, sent_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(user.user_id, user.team_id, period.start, period.end, message.to, message.subject, sentAt);

    result.sent.push({
      userId: user.user_id,
      recipientEmail: message.to,
      subject: message.subject,
      sentAt,
    });
  }

  return result;
}

export function startWorkspaceDigestJob(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null,
): WorkspaceDigestJob {
  if (!emailSender) return { stop() {} };

  async function run() {
    try {
      const result = await sendWeeklyWorkspaceDigests(db, config, emailSender);
      if (result.sent.length > 0) {
        console.log(`Sent ${result.sent.length} weekly workspace digest(s)`);
      }
    } catch (error) {
      console.error("Weekly workspace digests failed", error);
    }
  }

  void run();
  const timer = setInterval(run, config.workspaceDigestIntervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
