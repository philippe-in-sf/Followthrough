import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";

export type UserRole = "owner" | "admin" | "member";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  teamId: number;
  teamName: string;
  teamLogoUrl: string | null;
  teamWorkCalendarUrl: string | null;
};

export function authUserDto(row: AuthUser) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    team: {
      id: row.teamId,
      name: row.teamName,
      logoUrl: row.teamLogoUrl,
      workCalendarUrl: row.teamWorkCalendarUrl,
    },
  };
}

type SessionUserRow = AuthUser & {
  expiresAt: string;
};

export function hashToken(token: string) {
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
      `SELECT users.id,
              users.name,
              users.email,
              users.role,
              users.team_id AS teamId,
              teams.name AS teamName,
              teams.logo_url AS teamLogoUrl,
              teams.work_calendar_url AS teamWorkCalendarUrl,
              sessions.expires_at AS expiresAt
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       JOIN teams ON teams.id = users.team_id
       WHERE sessions.token_hash = ?`,
    )
    .get(hashToken(token)) as SessionUserRow | undefined;

  if (!row) return null;

  const expiresAt = Date.parse(row.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    teamId: row.teamId,
    teamName: row.teamName,
    teamLogoUrl: row.teamLogoUrl,
    teamWorkCalendarUrl: row.teamWorkCalendarUrl,
  };
}

export function getAuthUserById(db: AppDatabase, userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT users.id,
              users.name,
              users.email,
              users.role,
              users.team_id AS teamId,
              teams.name AS teamName,
              teams.logo_url AS teamLogoUrl,
              teams.work_calendar_url AS teamWorkCalendarUrl
       FROM users
       JOIN teams ON teams.id = users.team_id
       WHERE users.id = ?`,
    )
    .get(userId) as AuthUser | undefined;

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

export function destroySessionsForUser(db: AppDatabase, userId: number) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
