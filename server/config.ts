export type AppConfig = {
  port: number;
  databasePath: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  dueSoonDays: number;
  nodeEnv: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? "data/task-manager.sqlite",
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "tm_session",
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 14),
    dueSoonDays: Number(env.DUE_SOON_DAYS ?? 7),
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
