import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailSender = {
  send(message: EmailMessage): Promise<void>;
};

export function createEmailSender(config: AppConfig): EmailSender | null {
  if (!config.smtpHost || !config.taskReminderEmailFrom) return null;

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser
      ? {
          user: config.smtpUser,
          pass: config.smtpPass,
        }
      : undefined,
  });

  return {
    async send(message) {
      await transporter.sendMail({
        from: config.taskReminderEmailFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}
