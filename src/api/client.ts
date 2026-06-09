import type {
  AlertState,
  DecisionDto,
  MeetingDto,
  MeetingSeriesDto,
  MeetingType,
  PersonDto,
  TaskDto,
  TaskStatus,
} from "../../shared/types";
import type { User } from "./types";

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

export type DashboardTask = {
  publicId: string;
  description: string;
  assignee: PersonDto | null;
  status: TaskStatus;
  dueDate: string | null;
  alert: AlertState | null;
};

export type DashboardResponse = {
  alerts: { overdue: DashboardTask[]; dueSoon: DashboardTask[] };
  openTasksByAssignee: Array<{ assignee: PersonDto | null; tasks: DashboardTask[] }>;
  recentMeetings: Array<{ publicId: string; title: string; startsAt: string }>;
  recentDecisions: Array<{ publicId: string; decisionText: string; decisionDate: string }>;
  activeSeries: Array<{ publicId: string; title: string; cadenceLabel: string | null }>;
};

export type SearchResult = {
  type: "task" | "meeting" | "decision" | "person";
  publicId: string;
  title: string;
  subtitle: string;
};

type TaskInput = {
  description: string;
  assigneePublicId?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  originMeetingPublicId?: string | null;
  seriesPublicId?: string | null;
};

type MeetingInput = {
  title: string;
  startsAt: string;
  meetingType: MeetingType;
  seriesPublicId?: string | null;
  summary: string;
  attendeePublicIds: string[];
  taskPublicIds: string[];
};

type MeetingSeriesInput = {
  title: string;
  cadenceLabel?: string;
  active: boolean;
};

type OccurrenceInput = {
  title?: string;
  startsAt: string;
  summary: string;
  attendeePublicIds: string[];
};

type DecisionInput = {
  decisionText: string;
  decisionDate: string;
  context: string;
  meetingPublicId?: string | null;
};

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  signup: (body: {
    name: string;
    email: string;
    password: string;
    inviteCode: string;
  }) =>
    request<{ user: User }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  search: (query: string) =>
    request<{ results: SearchResult[] }>(`/api/search?${new URLSearchParams({ q: query })}`),
  people: {
    list: () => request<{ people: PersonDto[] }>("/api/people"),
    create: (body: { name: string; email?: string }) =>
      request<{ person: PersonDto }>("/api/people", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  tasks: {
    list: (query = "") => request<{ tasks: TaskDto[] }>(`/api/tasks${query}`),
    create: (body: TaskInput) =>
      request<{ task: TaskDto }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (publicId: string, body: TaskInput) =>
      request<{ task: TaskDto }>(`/api/tasks/${publicId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  meetings: {
    list: () => request<{ meetings: MeetingDto[] }>("/api/meetings"),
    create: (body: MeetingInput) =>
      request<{ meeting: MeetingDto }>("/api/meetings", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (publicId: string, body: MeetingInput) =>
      request<{ meeting: MeetingDto }>(`/api/meetings/${publicId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  series: {
    list: () => request<{ series: MeetingSeriesDto[] }>("/api/meeting-series"),
    create: (body: MeetingSeriesInput) =>
      request<{ series: MeetingSeriesDto }>("/api/meeting-series", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    createOccurrence: (publicId: string, body: OccurrenceInput) =>
      request<{ meeting: MeetingDto }>(`/api/meeting-series/${publicId}/occurrences`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  decisions: {
    list: () => request<{ decisions: DecisionDto[] }>("/api/decisions"),
    create: (body: DecisionInput) =>
      request<{ decision: DecisionDto }>("/api/decisions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (publicId: string, body: DecisionInput) =>
      request<{ decision: DecisionDto }>(`/api/decisions/${publicId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  get: request,
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
