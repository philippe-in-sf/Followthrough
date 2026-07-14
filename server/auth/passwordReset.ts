import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";
import type { EmailSender } from "../email/mailer.js";
import { hashPassword } from "./password.js";
import { destroySessionsForUser, hashToken } from "./sessions.js";

const passwordResetTtlMs = 60 * 60 * 1000;

type ResetUserRow = {
  id: number;
  name: string;
  email: string;
};

function appBaseUrl(config: AppConfig, requestOrigin: string) {
  return (config.appBaseUrl || requestOrigin).replace(/\/+$/, "");
}

export function buildPasswordResetUrl(config: AppConfig, requestOrigin: string, token: string) {
  const params = new URLSearchParams({ resetToken: token });
  return `${appBaseUrl(config, requestOrigin)}/?${params.toString()}#access`;
}

export function createPasswordResetToken(
  db: AppDatabase,
  userId: number,
  now = new Date(),
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + passwordResetTtlMs).toISOString();

  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").run(userId);
  db.prepare(
    "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(hashToken(token), userId, expiresAt);

  return { token, expiresAt };
}

export async function requestPasswordReset({
  db,
  config,
  emailSender,
  email,
  requestOrigin,
}: {
  db: AppDatabase;
  config: AppConfig;
  emailSender: EmailSender | null;
  email: string;
  requestOrigin: string;
}) {
  const user = db
    .prepare("SELECT id, name, email FROM users WHERE lower(email) = lower(?)")
    .get(email) as ResetUserRow | undefined;

  if (!user || !emailSender) return;

  const { token, expiresAt } = createPasswordResetToken(db, user.id);
  const resetUrl = buildPasswordResetUrl(config, requestOrigin, token);

  await emailSender.send({
    to: user.email,
    subject: "Reset your Followthrough password",
    text: [
      `Hi ${user.name},`,
      "",
      "Use this link to reset your Followthrough password:",
      resetUrl,
      "",
      `This link expires at ${expiresAt}.`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
  });
}

export async function resetPasswordWithToken(
  db: AppDatabase,
  token: string,
  newPassword: string,
  now = new Date(),
) {
  const row = db
    .prepare(
      `SELECT token_hash, user_id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND used_at IS NULL
         AND datetime(expires_at) > datetime(?)`,
    )
    .get(hashToken(token), now.toISOString()) as
    | { token_hash: string; user_id: number }
    | undefined;

  if (!row) throw badRequest("Password reset link is invalid or expired");

  const passwordHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
  db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ?").run(
    row.token_hash,
  );
  destroySessionsForUser(db, row.user_id);
}

export async function resetUserPassword(db: AppDatabase, userId: number, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  destroySessionsForUser(db, userId);
}
