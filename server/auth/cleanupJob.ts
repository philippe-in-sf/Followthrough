import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { withTransaction } from "../db/ids.js";

export type AuthCleanupResult = {
  sessions: number;
  oauthStates: number;
  passwordResetTokens: number;
};

export type AuthCleanupJob = {
  stop(): void;
};

export function cleanupExpiredAuthRecords(
  db: AppDatabase,
  config: Pick<AppConfig, "sessionIdleTimeoutMinutes">,
  now = new Date(),
): AuthCleanupResult {
  const nowIso = now.toISOString();
  const idleCutoff = new Date(
    now.getTime() - config.sessionIdleTimeoutMinutes * 60 * 1000,
  ).toISOString();

  return withTransaction(db, () => {
    const sessions = Number(
      db
        .prepare(
          `DELETE FROM sessions
           WHERE expires_at <= ?
              OR last_seen_at <= ?`,
        )
        .run(nowIso, idleCutoff).changes,
    );
    const oauthStates = Number(
      db
        .prepare(
          `DELETE FROM google_oauth_states
           WHERE expires_at <= ?`,
        )
        .run(nowIso).changes,
    );
    const passwordResetTokens = Number(
      db
        .prepare(
          `DELETE FROM password_reset_tokens
           WHERE expires_at <= ?
              OR used_at IS NOT NULL`,
        )
        .run(nowIso).changes,
    );

    return { sessions, oauthStates, passwordResetTokens };
  });
}

export function startAuthCleanupJob(
  db: AppDatabase,
  config: AppConfig,
): AuthCleanupJob {
  function run() {
    try {
      cleanupExpiredAuthRecords(db, config);
    } catch (error) {
      console.error("Expired authentication record cleanup failed", error);
    }
  }

  run();
  const configuredIntervalMs = Number.isFinite(config.authCleanupIntervalMs)
    ? config.authCleanupIntervalMs
    : 86_400_000;
  const intervalMs = Math.max(60_000, configuredIntervalMs);
  const timer = setInterval(run, intervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
