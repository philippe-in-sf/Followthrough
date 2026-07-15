import type {
  AlertState,
  AdminInviteCodeDto,
  AuditLogDto,
  DecisionDto,
  GoogleCalendarImportEventDto,
  MeetingDto,
  MeetingNoteDto,
  MeetingLinkType,
  MeetingSeriesDto,
  MeetingType,
  PersonDto,
  PersonMergeResultDto,
  PersonRelatedRecordsDto,
  TaskAssignmentNotificationDto,
  TaskDto,
  TaskReminderMode,
  TaskStatus,
  TeamDto,
  TeamUserDto,
  UserLoginEventDto,
  UserPreferencesDto,
  UserRole,
  WaitlistSignupDto,
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
  blockers: string;
  blockersClearedAt: string | null;
  assignee: PersonDto | null;
  status: TaskStatus;
  dueDate: string | null;
  alert: AlertState | null;
  private: boolean;
};

export type DashboardMeeting = {
  publicId: string;
  title: string;
  startsAt: string;
  blockers: string;
  blockersClearedAt: string | null;
};

export type DashboardResponse = {
  alerts: { overdue: DashboardTask[]; dueSoon: DashboardTask[] };
  openTasksByAssignee: Array<{ assignee: PersonDto | null; tasks: DashboardTask[] }>;
  activeBlockers: { tasks: DashboardTask[]; meetings: DashboardMeeting[] };
  recentMeetings: DashboardMeeting[];
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
  blockers?: string;
  notes?: string;
  blockersCleared?: boolean;
  assigneePublicId?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  originMeetingPublicId?: string | null;
  originDecisionPublicId?: string | null;
  seriesPublicId?: string | null;
  reminderMode?: TaskReminderMode;
  dependencyPublicIds?: string[];
  private?: boolean;
};

export type TaskReminderResponse = {
  reminder: {
    taskPublicId: string;
    recipientEmail: string;
    mode: TaskReminderMode;
    subject: string;
    sentAt: string;
  };
};

type MeetingInput = {
  title: string;
  startsAt: string;
  meetingType: MeetingType;
  seriesPublicId?: string | null;
  summary: string;
  blockers?: string;
  blockersCleared?: boolean;
  notes?: string;
  links?: MeetingLinkInput[];
  attendeePublicIds: string[];
  taskPublicIds: string[];
  private?: boolean;
};

type MeetingLinkInput = {
  label: string;
  url: string;
  linkType: MeetingLinkType;
};

export type MeetingNotesRange = "day" | "week" | "month" | "custom";

export type MeetingNotesQuery = {
  range: MeetingNotesRange;
  startDate?: string;
  endDate?: string;
};

export type MeetingNotesResponse = {
  range: MeetingNotesRange;
  startsAt: string;
  endsAt: string;
  notes: MeetingNoteDto[];
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
  blockers?: string;
  blockersCleared?: boolean;
  notes?: string;
  links?: MeetingLinkInput[];
  attendeePublicIds: string[];
  taskPublicIds?: string[];
  private?: boolean;
};

type DecisionInput = {
  decisionText: string;
  decisionDate: string;
  context: string;
  meetingPublicId?: string | null;
  followUpTask?: {
    description: string;
    blockers?: string;
    notes?: string;
    assigneePublicId?: string | null;
    status?: TaskStatus;
    dueDate?: string | null;
    private?: boolean;
  } | null;
};

type PersonInput = {
  firstName: string;
  lastName?: string;
  email?: string;
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
  requestPasswordReset: (body: { email: string }) =>
    request<{ ok: true }>("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmPasswordReset: (body: { token: string; newPassword: string }) =>
    request<void>("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  waitlist: (body: { name: string; email: string }) =>
    request<{ ok: true }>("/api/waitlist", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  stopImpersonation: () =>
    request<{ user: User }>("/api/auth/impersonation/stop", { method: "POST" }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<void>("/api/me/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  leaveTeam: () => request<{ user: User }>("/api/me/team/leave", { method: "POST" }),
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  search: (query: string) =>
    request<{ results: SearchResult[] }>(`/api/search?${new URLSearchParams({ q: query })}`),
  preferences: {
    get: () => request<UserPreferencesDto>("/api/me/preferences"),
    update: (body: { workCalendarUrl: string | null }) =>
      request<UserPreferencesDto>("/api/me/preferences", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  meetingNotes: {
    list: (query: MeetingNotesQuery) => {
      const params = new URLSearchParams({ range: query.range });
      if (query.startDate) params.set("startDate", query.startDate);
      if (query.endDate) params.set("endDate", query.endDate);
      return request<MeetingNotesResponse>(`/api/me/meeting-notes?${params}`);
    },
  },
  admin: {
    team: () => request<{ team: TeamDto }>("/api/admin/team"),
    updateTeam: (body: { name: string; logoUrl: string | null; workCalendarUrl: string | null }) =>
      request<{ team: TeamDto }>("/api/admin/team", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    users: () => request<{ users: TeamUserDto[] }>("/api/admin/users"),
    loginEvents: () => request<{ loginEvents: UserLoginEventDto[] }>("/api/admin/login-events"),
    waitlist: () => request<{ signups: WaitlistSignupDto[] }>("/api/admin/waitlist"),
    createWaitlistInviteCode: (signupId: number, body: { code: string; role: UserRole }) =>
      request<{ inviteCode: AdminInviteCodeDto; signup: WaitlistSignupDto }>(
        `/api/admin/waitlist/${signupId}/invite-code`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    createWaitlistUser: (signupId: number, body: { password: string; role: UserRole }) =>
      request<{ user: TeamUserDto; signup: WaitlistSignupDto }>(
        `/api/admin/waitlist/${signupId}/direct-user`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    createUser: (body: { name: string; email: string; password: string; role: UserRole }) =>
      request<{ user: TeamUserDto }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateUserRole: (userId: number, role: UserRole) =>
      request<{ user: TeamUserDto }>(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    resetUserPassword: (userId: number, password: string) =>
      request<void>(`/api/admin/users/${userId}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    impersonateUser: (userId: number) =>
      request<{ user: User }>(`/api/admin/users/${userId}/impersonate`, {
        method: "POST",
      }),
    removeUserFromTeam: (userId: number) =>
      request<{ user: TeamUserDto }>(`/api/admin/users/${userId}/remove`, {
        method: "POST",
      }),
  },
  people: {
    list: () => request<{ people: PersonDto[] }>("/api/people"),
    create: (body: PersonInput) =>
      request<{ person: PersonDto }>("/api/people", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (publicId: string, body: PersonInput) =>
      request<{ person: PersonDto }>(`/api/people/${publicId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    archive: (publicId: string) =>
      request<void>(`/api/people/${publicId}/archive`, { method: "POST" }),
    merge: (sourcePublicId: string, body: { targetPublicId: string }) =>
      request<PersonMergeResultDto>(`/api/people/${sourcePublicId}/merge`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    audit: (publicId: string) =>
      request<{ auditEvents: AuditLogDto[] }>(`/api/people/${publicId}/audit`),
    records: (publicId: string) =>
      request<PersonRelatedRecordsDto>(`/api/people/${publicId}/records`),
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
    archive: (publicId: string) =>
      request<void>(`/api/tasks/${publicId}/archive`, { method: "POST" }),
    restore: (publicId: string) =>
      request<{ task: TaskDto }>(`/api/tasks/${publicId}/restore`, { method: "POST" }),
    audit: (publicId: string) =>
      request<{ auditEvents: AuditLogDto[] }>(`/api/tasks/${publicId}/audit`),
    sendReminder: (publicId: string) =>
      request<TaskReminderResponse>(`/api/tasks/${publicId}/reminders`, { method: "POST" }),
  },
  meetings: {
    list: (query = "") => request<{ meetings: MeetingDto[] }>(`/api/meetings${query}`),
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
    archive: (publicId: string) =>
      request<void>(`/api/meetings/${publicId}/archive`, { method: "POST" }),
    restore: (publicId: string) =>
      request<{ meeting: MeetingDto }>(`/api/meetings/${publicId}/restore`, { method: "POST" }),
    audit: (publicId: string) =>
      request<{ auditEvents: AuditLogDto[] }>(`/api/meetings/${publicId}/audit`),
  },
  googleCalendar: {
    searchEvents: (query: string) =>
      request<{ events: GoogleCalendarImportEventDto[] }>(
        `/api/google-calendar/events?${new URLSearchParams({ query })}`,
      ),
    disconnect: () =>
      request<void>("/api/google-calendar/connection", { method: "DELETE" }),
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
  notifications: {
    config: () => request<{ publicVapidKey: string | null }>("/api/notifications/config"),
    savePushSubscription: (body: PushSubscriptionJSON) =>
      request<void>("/api/notifications/push-subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    taskAssignments: (afterId = 0) =>
      request<{ notifications: TaskAssignmentNotificationDto[] }>(
        `/api/notifications/task-assignments?afterId=${afterId}`,
      ),
    markTaskAssignmentRead: (id: number) =>
      request<void>(`/api/notifications/task-assignments/${id}/read`, { method: "POST" }),
  },
  get: request,
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
