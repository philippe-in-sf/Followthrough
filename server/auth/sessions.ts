import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  return Object.fromEntries(
    cookieHeader.split(";").flatMap((part) => {
      const [name, ...rest] = part.trim().split("=");
      if (!name || rest.length === 0) return [];
      return [[name, decodeURIComponent(rest.join("="))]];
    }),
  );
}

export function createSession(
  db: AppDatabase,
  res: Response,
  userId: number,
  config: AppConfig,
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    userId,
    expiresAt.toISOString(),
  );

  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response, config: AppConfig) {
  res.clearCookie(config.sessionCookieName, { path: "/" });
}

export function getSessionUser(
  db: AppDatabase,
  cookieHeader: string | undefined,
  config: AppConfig,
): AuthUser | null {
  const token = parseCookies(cookieHeader)[config.sessionCookieName];
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT users.id, users.name, users.email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND datetime(sessions.expires_at) > datetime('now')`,
    )
    .get(hashToken(token)) as AuthUser | undefined;

  return row ?? null;
}

export function destroySession(
  db: AppDatabase,
  cookieHeader: string | undefined,
  config: AppConfig,
) {
  const token = parseCookies(cookieHeader)[config.sessionCookieName];
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}
