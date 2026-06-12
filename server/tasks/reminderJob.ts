import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import type { EmailSender } from "../email/mailer.js";
import { sendAutomaticTaskReminders } from "./reminders.js";

export type TaskReminderJob = {
  stop(): void;
};

export function startAutomaticTaskReminderJob(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null,
): TaskReminderJob {
  if (!config.taskReminderAutoEnabled) return { stop() {} };

  if (!emailSender) {
    console.warn("Automatic task reminders are enabled, but email is not configured");
    return { stop() {} };
  }

  async function run() {
    try {
      const result = await sendAutomaticTaskReminders(db, config, emailSender);
      if (result.sent.length > 0) {
        console.log(`Sent ${result.sent.length} automatic task reminder(s)`);
      }
    } catch (error) {
      console.error("Automatic task reminders failed", error);
    }
  }

  void run();
  const timer = setInterval(run, config.taskReminderAutoIntervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
