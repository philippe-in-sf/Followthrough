export type TaskStatus = "Open" | "In Progress" | "Blocked" | "Done";
export type TaskReminderMode = "automatic" | "manual";
export type MeetingType = "single" | "recurring";
export type MeetingLinkType = "agenda" | "work" | "reference" | "other";
export type AlertState = "dueSoon" | "overdue";
export type AuditEntityType = "task" | "meeting" | "person";

export type PersonDto = {
  publicId: string;
  name: string;
  email: string | null;
  archived: boolean;
};

export type TaskDto = {
  publicId: string;
  description: string;
  assignee: PersonDto | null;
  status: TaskStatus;
  dueDate: string | null;
  originMeetingPublicId: string | null;
  seriesPublicId: string | null;
  reminderMode: TaskReminderMode;
  lastReminderSentAt: string | null;
  alert: AlertState | null;
  private: boolean;
  archived: boolean;
};

export type PersonRelatedTaskDto = {
  publicId: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  private: boolean;
};

export type PersonRelatedMeetingDto = {
  publicId: string;
  title: string;
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
  notes: string;
  links: MeetingLinkDto[];
  attendees: PersonDto[];
  tasks: TaskDto[];
  private: boolean;
  archived: boolean;
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
