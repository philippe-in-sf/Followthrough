export type TaskStatus = "Open" | "In Progress" | "Blocked" | "Done";
export type TaskReminderMode = "automatic" | "manual";
export type MeetingType = "single" | "recurring";
export type MeetingLinkType = "agenda" | "work" | "reference" | "other";
export type AlertState = "dueSoon" | "overdue";
export type AuditEntityType = "task" | "meeting" | "decision" | "person";
export type UserRole = "admin" | "member";

export type TeamDto = {
  id: number;
  name: string;
  logoUrl: string | null;
  workCalendarUrl: string | null;
};

export type TeamUserDto = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  teamId: number;
};

export type WaitlistHandledAction = "invite_code" | "direct_user";

export type WaitlistSignupDto = {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
  handledByUserId: number | null;
  handledByName: string | null;
  handledAction: WaitlistHandledAction | null;
  inviteCode: string | null;
  createdUserId: number | null;
};

export type AdminInviteCodeDto = {
  id: number;
  code: string;
  usageLimit: number | null;
  defaultRole: UserRole;
};

export type PersonDto = {
  publicId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  archived: boolean;
};

export type TaskDependencyDto = {
  publicId: string;
  description: string;
  status: TaskStatus;
  archived: boolean;
};

export type TaskDto = {
  publicId: string;
  description: string;
  blockers: string;
  notes: string;
  blockersClearedAt: string | null;
  assignee: PersonDto | null;
  status: TaskStatus;
  dueDate: string | null;
  originMeetingPublicId: string | null;
  originDecisionPublicId: string | null;
  seriesPublicId: string | null;
  reminderMode: TaskReminderMode;
  lastReminderSentAt: string | null;
  alert: AlertState | null;
  dependencies: TaskDependencyDto[];
  private: boolean;
  archived: boolean;
};

export type PersonRelatedTaskDto = {
  publicId: string;
  description: string;
  blockers: string;
  notes: string;
  blockersClearedAt: string | null;
  status: TaskStatus;
  dueDate: string | null;
  private: boolean;
};

export type PersonRelatedMeetingDto = {
  publicId: string;
  title: string;
  blockers: string;
  blockersClearedAt: string | null;
  startsAt: string;
  meetingType: MeetingType;
  private: boolean;
};

export type PersonRelatedDecisionDto = {
  publicId: string;
  decisionText: string;
  decisionDate: string;
  context: string;
  meetingPublicId: string;
};

export type PersonRelatedRecordsDto = {
  person: PersonDto;
  tasks: PersonRelatedTaskDto[];
  meetings: PersonRelatedMeetingDto[];
  decisions: PersonRelatedDecisionDto[];
};

export type PersonMergeResultDto = {
  sourcePerson: PersonDto;
  targetPerson: PersonDto;
  movedTasks: number;
  movedMeetingAttendances: number;
};

export type MeetingDto = {
  publicId: string;
  title: string;
  startsAt: string;
  meetingType: MeetingType;
  seriesPublicId: string | null;
  summary: string;
  blockers: string;
  blockersClearedAt: string | null;
  notes: string;
  links: MeetingLinkDto[];
  attendees: PersonDto[];
  tasks: TaskDto[];
  private: boolean;
  archived: boolean;
};

export type MeetingNoteMatchReason = "creator" | "attendee";

export type MeetingNoteDto = {
  publicId: string;
  title: string;
  startsAt: string;
  notes: string;
  matchReasons: MeetingNoteMatchReason[];
  attendees: PersonDto[];
};

export type MeetingLinkDto = {
  id: number;
  label: string;
  url: string;
  linkType: MeetingLinkType;
};

export type GoogleCalendarImportEventDto = {
  id: string;
  title: string;
  startsAt: string;
  summary: string;
  notes: string;
  attendeeNames: string;
  links: Array<{
    label: string;
    url: string;
    linkType: MeetingLinkType;
  }>;
};

export type UserPreferencesDto = {
  workCalendarUrl: string | null;
  googleCalendarConfigured: boolean;
  googleCalendarConnected: boolean;
  googleCalendarEmail: string | null;
};

export type MeetingSeriesDto = {
  publicId: string;
  title: string;
  cadenceLabel: string | null;
  active: boolean;
  archived: boolean;
};

export type DecisionDto = {
  publicId: string;
  decisionText: string;
  decisionDate: string;
  context: string;
  meetingPublicId: string | null;
  tasks: TaskDto[];
  archived: boolean;
};

export type AuditLogDto = {
  id: number;
  entityType: AuditEntityType;
  entityPublicId: string;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
  changes: Record<string, unknown>;
};

export type TaskAssignmentNotificationDto = {
  id: number;
  taskPublicId: string;
  taskDescription: string;
  triggeredByName: string | null;
  createdAt: string;
};
