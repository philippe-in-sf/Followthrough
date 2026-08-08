import path from "node:path";

export type AppConfig = {
  port: number;
  databasePath: string;
  backupEnabled: boolean;
  backupDir: string;
  backupIntervalMs: number;
  backupRetentionCount: number;
  backupEncryptionKey: string;
  backupEncryptionPreviousKeys: string[];
  authCleanupIntervalMs: number;
  sessionCookieName: string;
  sessionTtlDays: number;
  sessionIdleTimeoutMinutes: number;
  dueSoonDays: number;
  appBaseUrl: string;
  taskReminderEmailFrom: string;
  taskReminderAutoEnabled: boolean;
  taskReminderAutoIntervalMs: number;
  taskAutoArchiveAfterDays: number;
  taskAutoArchiveIntervalMs: number;
  workspaceDigestIntervalMs: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  nodeEnv: string;
  googleOAuthClientId: string;
  googleOAuthClientSecret: string;
  googleOAuthRedirectUri: string;
  googleOAuthTokenEncryptionKey: string;
  googleOAuthTokenEncryptionPreviousKeys: string[];
  calendarFeedEncryptionKey: string;
  calendarFeedEncryptionPreviousKeys: string[];
  projectsEnabled?: boolean;
};

function commaSeparatedValues(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databasePath = env.DATABASE_PATH ?? "data/task-manager.sqlite";

  return {
    port: Number(env.PORT ?? 3000),
    databasePath,
    backupEnabled: env.BACKUP_ENABLED !== "false",
    backupDir: env.BACKUP_DIR ?? path.join(path.dirname(databasePath), "backups"),
    backupIntervalMs: Number(env.BACKUP_INTERVAL_MS ?? 86_400_000),
    backupRetentionCount: Number(env.BACKUP_RETENTION_COUNT ?? 14),
    backupEncryptionKey: env.BACKUP_ENCRYPTION_KEY ?? "",
    backupEncryptionPreviousKeys: commaSeparatedValues(
      env.BACKUP_ENCRYPTION_PREVIOUS_KEYS,
    ),
    authCleanupIntervalMs: Number(env.AUTH_CLEANUP_INTERVAL_MS ?? 86_400_000),
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "tm_session",
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 14),
    sessionIdleTimeoutMinutes: Number(env.SESSION_IDLE_TIMEOUT_MINUTES ?? 1440),
    dueSoonDays: Number(env.DUE_SOON_DAYS ?? 7),
    appBaseUrl: env.APP_BASE_URL ?? "",
    taskReminderEmailFrom: env.TASK_REMINDER_EMAIL_FROM ?? "",
    taskReminderAutoEnabled: env.TASK_REMINDER_AUTO_ENABLED === "true",
    taskReminderAutoIntervalMs: Number(env.TASK_REMINDER_AUTO_INTERVAL_MS ?? 86_400_000),
    taskAutoArchiveAfterDays: Number(env.TASK_AUTO_ARCHIVE_AFTER_DAYS ?? 14),
    taskAutoArchiveIntervalMs: Number(env.TASK_AUTO_ARCHIVE_INTERVAL_MS ?? 86_400_000),
    workspaceDigestIntervalMs: Number(env.WORKSPACE_DIGEST_INTERVAL_MS ?? 86_400_000),
    smtpHost: env.SMTP_HOST ?? "",
    smtpPort: Number(env.SMTP_PORT ?? 587),
    smtpSecure: env.SMTP_SECURE === "true",
    smtpUser: env.SMTP_USER ?? "",
    smtpPass: env.SMTP_PASS ?? "",
    nodeEnv: env.NODE_ENV ?? "development",
    googleOAuthClientId: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    googleOAuthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    googleOAuthRedirectUri: env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
    googleOAuthTokenEncryptionKey: env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY ?? "",
    googleOAuthTokenEncryptionPreviousKeys: commaSeparatedValues(
      env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS,
    ),
    calendarFeedEncryptionKey:
      env.CALENDAR_FEED_ENCRYPTION_KEY ?? env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY ?? "",
    calendarFeedEncryptionPreviousKeys: commaSeparatedValues(
      env.CALENDAR_FEED_ENCRYPTION_PREVIOUS_KEYS ??
        env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS,
    ),
    projectsEnabled: env.PROJECTS_ENABLED !== "false",
  };
}
