import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

type GoogleCalendarConnectionRow = {
  user_id: number;
  google_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
  scope: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
};

export function isGoogleOAuthConfigured(config: AppConfig) {
  return Boolean(
    config.googleOAuthClientId.trim() &&
      config.googleOAuthClientSecret.trim() &&
      config.googleOAuthRedirectUri.trim(),
  );
}

export function createGoogleOAuthState(db: AppDatabase, userId: number) {
  const state = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO google_oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(state, userId, expiresAt);
  return state;
}

export function consumeGoogleOAuthState(db: AppDatabase, userId: number, state: string) {
  const row = db
    .prepare(
      `
        SELECT state
        FROM google_oauth_states
        WHERE state = ? AND user_id = ? AND datetime(expires_at) > datetime('now')
      `,
    )
    .get(state, userId) as { state: string } | undefined;

  db.prepare("DELETE FROM google_oauth_states WHERE state = ?").run(state);
  return Boolean(row);
}

export function buildGoogleAuthorizationUrl(config: AppConfig, state: string, loginHint?: string) {
  if (!isGoogleOAuthConfigured(config)) {
    throw badRequest("Google Calendar connection is not configured for this deployment.");
  }

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.googleOAuthClientId.trim());
  url.searchParams.set("redirect_uri", config.googleOAuthRedirectUri.trim());
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    `${GOOGLE_CALENDAR_READONLY_SCOPE} ${GOOGLE_USERINFO_EMAIL_SCOPE}`,
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

async function requestGoogleToken(params: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw badRequest("Google Calendar could not be connected.");
  }

  const body = (await response.json()) as GoogleTokenResponse;
  if (!body.access_token || !body.expires_in) {
    throw badRequest("Google Calendar could not be connected.");
  }

  return body;
}

export async function exchangeGoogleOAuthCode(config: AppConfig, code: string) {
  const params = new URLSearchParams({
    code,
    client_id: config.googleOAuthClientId.trim(),
    client_secret: config.googleOAuthClientSecret.trim(),
    redirect_uri: config.googleOAuthRedirectUri.trim(),
    grant_type: "authorization_code",
  });

  return requestGoogleToken(params);
}

export async function refreshGoogleAccessToken(
  config: AppConfig,
  refreshToken: string,
) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.googleOAuthClientId.trim(),
    client_secret: config.googleOAuthClientSecret.trim(),
    grant_type: "refresh_token",
  });

  return requestGoogleToken(params);
}

export async function fetchGoogleUserEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  const body = (await response.json()) as GoogleUserInfoResponse;
  return body.email?.trim() || null;
}

export function saveGoogleCalendarConnection(
  db: AppDatabase,
  input: {
    userId: number;
    googleEmail: string | null;
    accessToken: string;
    refreshToken: string | null;
    expiresInSeconds: number;
    scope: string;
  },
) {
  const tokenExpiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
  db.prepare(
    `
      INSERT INTO google_calendar_connections (
        user_id,
        google_email,
        access_token,
        refresh_token,
        token_expires_at,
        scope,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        google_email = excluded.google_email,
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_calendar_connections.refresh_token),
        token_expires_at = excluded.token_expires_at,
        scope = excluded.scope,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(
    input.userId,
    input.googleEmail,
    input.accessToken,
    input.refreshToken,
    tokenExpiresAt,
    input.scope,
  );
}

export function getGoogleCalendarConnection(db: AppDatabase, userId: number) {
  return db
    .prepare(
      `
        SELECT user_id, google_email, access_token, refresh_token, token_expires_at, scope
        FROM google_calendar_connections
        WHERE user_id = ?
      `,
    )
    .get(userId) as GoogleCalendarConnectionRow | undefined;
}

export function getGoogleCalendarConnectionStatus(
  db: AppDatabase,
  config: AppConfig,
  userId: number,
) {
  const configured = isGoogleOAuthConfigured(config);
  const connection = getGoogleCalendarConnection(db, userId);
  return {
    googleCalendarConfigured: configured,
    googleCalendarConnected: configured && Boolean(connection),
    googleCalendarEmail: configured ? (connection?.google_email ?? null) : null,
  };
}

export async function getGoogleCalendarAccessToken(
  db: AppDatabase,
  config: AppConfig,
  userId: number,
) {
  if (!isGoogleOAuthConfigured(config)) {
    throw badRequest("Google Calendar connection is not configured for this deployment.");
  }

  const connection = getGoogleCalendarConnection(db, userId);
  if (!connection) {
    throw badRequest("Connect Google Calendar before importing events.");
  }

  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return connection.access_token;
  }

  if (!connection.refresh_token) {
    throw badRequest("Reconnect Google Calendar before importing events.");
  }

  const token = await refreshGoogleAccessToken(config, connection.refresh_token);
  saveGoogleCalendarConnection(db, {
    userId,
    googleEmail: connection.google_email,
    accessToken: token.access_token ?? "",
    refreshToken: token.refresh_token ?? null,
    expiresInSeconds: token.expires_in ?? 3600,
    scope: token.scope ?? connection.scope,
  });

  return token.access_token ?? "";
}

export function deleteGoogleCalendarConnection(db: AppDatabase, userId: number) {
  db.prepare("DELETE FROM google_calendar_connections WHERE user_id = ?").run(userId);
}
