export type ClientConfigEnv = {
  [key: string]: unknown;
};

export type ClientAppConfig = {
  workCalendarUrl: string | null;
};

function parseOptionalHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return candidate;
  } catch {
    return null;
  }
}

export function loadClientConfig(env: ClientConfigEnv = import.meta.env as ClientConfigEnv): ClientAppConfig {
  return {
    workCalendarUrl: parseOptionalHttpUrl(env.VITE_WORK_CALENDAR_URL),
  };
}
