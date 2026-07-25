import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";

export type UserRole = "owner" | "admin" | "member";

type ImpersonationActor = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  teamId: number;
  teamName: string;
  teamLogoUrl: string | null;
  teamWorkCalendarUrl: string | null;
  impersonation?: {
    actor: ImpersonationActor;
  } | null;
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
    impersonation: row.impersonation
      ? {
          actor: row.impersonation.actor,
        }
      : null,
  };
}

type SessionRow = {
  userId: number;
  impersonatedUserId: number | null;
  expiresAt: string;
  lastSeenAt: string;
};

const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

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
  const now = new Date();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), userId, expiresAt.toISOString(), now.toISOString());

  setSessionCookie(res, config, token, expiresAt);
}

function setSessionCookie(
  res: Response,
  config: AppConfig,
  token: string,
  expiresAt: Date,
) {
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

function getSessionRow(
  db: AppDatabase,
  cookieHeader: string | undefined,
  config: AppConfig,
): { tokenHash: string; row: SessionRow } | null {
  const token = parseCookies(cookieHeader)[config.sessionCookieName];
  if (!token) return null;
  const tokenHash = hashToken(token);

  const row = db
    .prepare(
      `SELECT sessions.user_id AS userId,
              sessions.impersonated_user_id AS impersonatedUserId,
              sessions.expires_at AS expiresAt,
              sessions.last_seen_at AS lastSeenAt
       FROM sessions
       WHERE sessions.token_hash = ?`,
    )
    .get(tokenHash) as SessionRow | undefined;

  if (!row) return null;

  const now = Date.now();
  const expiresAt = Date.parse(row.expiresAt);
  const lastSeenAt = parseDatabaseTimestamp(row.lastSeenAt);
  const idleTimeoutMs = config.sessionIdleTimeoutMinutes * 60 * 1000;
  if (
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(lastSeenAt) ||
    !Number.isFinite(idleTimeoutMs) ||
    idleTimeoutMs <= 0 ||
    expiresAt <= now ||
    lastSeenAt + idleTimeoutMs <= now
  ) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  const writeIntervalMs = Math.min(LAST_SEEN_WRITE_INTERVAL_MS, idleTimeoutMs / 4);
  if (lastSeenAt + writeIntervalMs <= now) {
    const refreshedLastSeenAt = new Date(now).toISOString();
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(
      refreshedLastSeenAt,
      tokenHash,
    );
    row.lastSeenAt = refreshedLastSeenAt;
  }

  return { tokenHash, row };
}

function parseDatabaseTimestamp(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

function canImpersonate(actor: AuthUser, target: AuthUser) {
  if (target.role !== "member") return false;
  if (actor.role === "owner") return true;
  return actor.role === "admin" && actor.teamId === target.teamId;
}

export function getSessionUser(
  db: AppDatabase,
  cookieHeader: string | undefined,
  config: AppConfig,
): AuthUser | null {
  const session = getSessionRow(db, cookieHeader, config);
  if (!session) return null;

  const actor = getAuthUserById(db, session.row.userId);
  if (!actor) return null;

  if (!session.row.impersonatedUserId) return actor;

  const target = getAuthUserById(db, session.row.impersonatedUserId);
  if (!target || !canImpersonate(actor, target)) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(session.tokenHash);
    return null;
  }

  return {
    ...target,
    impersonation: {
      actor: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
    },
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

export function startSessionImpersonation(
  db: AppDatabase,
  res: Response,
  cookieHeader: string | undefined,
  config: AppConfig,
  targetUserId: number,
) {
  const session = getSessionRow(db, cookieHeader, config);
  if (!session) return null;

  const token = randomBytes(32).toString("hex");
  const updated = db
    .prepare(
      `UPDATE sessions
       SET token_hash = ?, impersonated_user_id = ?, last_seen_at = ?
       WHERE token_hash = ?`,
    )
    .run(
      hashToken(token),
      targetUserId,
      new Date().toISOString(),
      session.tokenHash,
    );
  if (updated.changes !== 1) return null;

  setSessionCookie(res, config, token, new Date(session.row.expiresAt));
  return getSessionUser(db, `${config.sessionCookieName}=${token}`, config);
}

export function stopSessionImpersonation(
  db: AppDatabase,
  res: Response,
  cookieHeader: string | undefined,
  config: AppConfig,
) {
  const session = getSessionRow(db, cookieHeader, config);
  if (!session) return null;

  const token = randomBytes(32).toString("hex");
  const updated = db
    .prepare(
      `UPDATE sessions
       SET token_hash = ?, impersonated_user_id = NULL, last_seen_at = ?
       WHERE token_hash = ?`,
    )
    .run(hashToken(token), new Date().toISOString(), session.tokenHash);
  if (updated.changes !== 1) return null;

  setSessionCookie(res, config, token, new Date(session.row.expiresAt));
  return getSessionUser(db, `${config.sessionCookieName}=${token}`, config);
}

export function destroyImpersonatingSessionsForUser(db: AppDatabase, userId: number) {
  db.prepare("DELETE FROM sessions WHERE impersonated_user_id = ?").run(userId);
}

export function destroySessionsForUser(db: AppDatabase, userId: number) {
  destroyImpersonatingSessionsForUser(db, userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
