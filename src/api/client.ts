export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(response.status, body.error ?? "Request failed");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: import("./types").User | null }>("/api/auth/me"),
  login: (body: { email: string; password: string }) =>
    request<{ user: import("./types").User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  signup: (body: {
    name: string;
    email: string;
    password: string;
    inviteCode: string;
  }) =>
    request<{ user: import("./types").User }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  dashboard: () =>
    request<{
      alerts: { overdue: unknown[]; dueSoon: unknown[] };
      openTasksByAssignee: unknown[];
      recentMeetings: unknown[];
      recentDecisions: unknown[];
      activeSeries: unknown[];
    }>("/api/dashboard"),
  get: request,
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
