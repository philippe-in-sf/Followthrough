export type AppConfig = {
  port: number;
  databasePath: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  dueSoonDays: number;
  appBaseUrl: string;
  taskReminderEmailFrom: string;
  taskReminderAutoEnabled: boolean;
  taskReminderAutoIntervalMs: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  nodeEnv: string;
  googleOAuthClientId: string;
  googleOAuthClientSecret: string;
  googleOAuthRedirectUri: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? "data/task-manager.sqlite",
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "tm_session",
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 14),
    dueSoonDays: Number(env.DUE_SOON_DAYS ?? 7),
    appBaseUrl: env.APP_BASE_URL ?? "",
    taskReminderEmailFrom: env.TASK_REMINDER_EMAIL_FROM ?? "",
    taskReminderAutoEnabled: env.TASK_REMINDER_AUTO_ENABLED === "true",
    taskReminderAutoIntervalMs: Number(env.TASK_REMINDER_AUTO_INTERVAL_MS ?? 86_400_000),
    smtpHost: env.SMTP_HOST ?? "",
    smtpPort: Number(env.SMTP_PORT ?? 587),
    smtpSecure: env.SMTP_SECURE === "true",
    smtpUser: env.SMTP_USER ?? "",
    smtpPass: env.SMTP_PASS ?? "",
    nodeEnv: env.NODE_ENV ?? "development",
    googleOAuthClientId: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    googleOAuthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    googleOAuthRedirectUri: env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
  };
}
