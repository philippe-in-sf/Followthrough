import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarPlus, LinkIcon, Plus, Save, Trash2 } from "lucide-react";
import type {
  AuditLogDto,
  GoogleCalendarImportEventDto,
  MeetingDto,
  MeetingLinkDto,
  MeetingLinkType,
  MeetingSeriesDto,
  MeetingType,
  PersonDto,
  TaskDto,
} from "../../../shared/types";
import { api } from "../../api/client";
import { hasActiveBlockers, hasBlockers, hasClearedBlockers } from "../../blockers";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { collapseLinks, LinkedText } from "../../components/LinkedText";
import { StatusBadge } from "../../components/StatusBadge";
import { scrollRecordIntoView } from "../../recordFocus";

type MeetingFormState = {
  publicId: string;
  title: string;
  startsAt: string;
  meetingType: MeetingType;
  seriesPublicId: string;
  summary: string;
  blockers: string;
  blockersCleared: boolean;
  attendeePublicIds: string[];
  attendeeNames: string;
  taskPublicIds: string[];
  private: boolean;
};

type SeriesFormState = {
  title: string;
  cadenceLabel: string;
  active: boolean;
};

type OccurrenceFormState = {
  seriesPublicId: string;
  startsAt: string;
  title: string;
  summary: string;
  blockers: string;
  blockersCleared: boolean;
  attendeePublicIds: string[];
  attendeeNames: string;
  private: boolean;
};

type MeetingTaskFormState = {
  description: string;
  blockers: string;
  notes: string;
  blockersCleared: boolean;
  assigneePublicId: string;
  status: TaskDto["status"];
  dueDate: string;
  private: boolean;
};

type MeetingLinkFormState = {
  label: string;
  url: string;
  linkType: MeetingLinkType;
};

type CalendarImportDetails = {
  sourceTitle: string;
  notes: string;
  links: MeetingLinkFormState[];
};

type MeetingLane = {
  key: string;
  title: string;
  ariaLabel: string;
  tone: "bad" | "info" | "neutral";
  meetings: MeetingDto[];
};

type MeetingArchiveView = "active" | "archived";

const emptyMeetingForm: MeetingFormState = {
  publicId: "",
  title: "",
  startsAt: "",
  meetingType: "single",
  seriesPublicId: "",
  summary: "",
  blockers: "",
  blockersCleared: false,
  attendeePublicIds: [],
  attendeeNames: "",
  taskPublicIds: [],
  private: false,
};

const emptySeriesForm: SeriesFormState = {
  title: "",
  cadenceLabel: "",
  active: true,
};

const emptyOccurrenceForm: OccurrenceFormState = {
  seriesPublicId: "",
  startsAt: "",
  title: "",
  summary: "",
  blockers: "",
  blockersCleared: false,
  attendeePublicIds: [],
  attendeeNames: "",
  private: false,
};

const emptyMeetingTaskForm: MeetingTaskFormState = {
  description: "",
  blockers: "",
  notes: "",
  blockersCleared: false,
  assigneePublicId: "",
  status: "Open",
  dueDate: "",
  private: false,
};

const emptyMeetingLinkForm: MeetingLinkFormState = {
  label: "",
  url: "",
  linkType: "agenda",
};

const meetingLinkTypes: Array<{ value: MeetingLinkType; label: string }> = [
  { value: "agenda", label: "Agenda" },
  { value: "work", label: "Work" },
  { value: "reference", label: "Reference" },
  { value: "other", label: "Other" },
];

function toApiDateTime(value: string) {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

function toDateTimeInputValue(value: string) {
  return value ? value.slice(0, 16) : "";
}

function toggleValue(values: string[], value: string, checked: boolean) {
  if (checked) return [...new Set([...values, value])];
  return values.filter((item) => item !== value);
}

function parseAttendeeNames(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function singleLineText(value: string, fallback: string) {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact || fallback;
}

function attendeeSummary(meeting: MeetingDto) {
  return meeting.attendees.length > 0
    ? meeting.attendees.map((attendee) => attendee.name).join(", ")
    : "No attendees";
}

function taskOptionLabel(task: TaskDto) {
  return (
    <>
      {task.publicId} <LinkedText text={task.description} />
    </>
  );
}

function toMeetingLinkForm(link: MeetingLinkDto): MeetingLinkFormState {
  return {
    label: link.label,
    url: link.url,
    linkType: link.linkType,
  };
}

function linkTypeLabel(value: MeetingLinkType) {
  return meetingLinkTypes.find((type) => type.value === value)?.label ?? "Link";
}

function MeetingBlockerNote({ meeting }: { meeting: MeetingDto }) {
  if (!hasBlockers(meeting)) return null;

  return (
    <p className={`blocker-note ${hasClearedBlockers(meeting) ? "blocker-note-cleared" : ""}`}>
      <strong>{hasClearedBlockers(meeting) ? "Cleared blocker" : "Blocker"}</strong>
      <span>
        <LinkedText text={meeting.blockers} />
      </span>
      {meeting.blockersClearedAt ? (
        <small>Cleared {new Date(meeting.blockersClearedAt).toLocaleString()}</small>
      ) : null}
    </p>
  );
}

function MeetingTaskLinks({ meeting }: { meeting: MeetingDto }) {
  if (meeting.tasks.length === 0) {
    return <p className="muted meeting-empty-detail">No tasks</p>;
  }

  return (
    <div className="task-links">
      {meeting.tasks.map((task) => (
        <span key={task.publicId}>
          <strong>{task.publicId}</strong> <LinkedText text={task.description} />
          {hasActiveBlockers(task) ? <StatusBadge label="Blocker" tone="bad" /> : null}
          {hasClearedBlockers(task) ? (
            <StatusBadge label="Blocker cleared" tone="good" />
          ) : null}
          {hasBlockers(task) ? (
            <small className="task-link-blocker">
              <LinkedText text={task.blockers} />
            </small>
          ) : null}
          {(task.notes ?? "").trim() ? (
            <small className="task-link-notes">
              <LinkedText text={task.notes} />
            </small>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function MeetingStructuredLinks({ meeting }: { meeting: MeetingDto }) {
  if (meeting.links.length === 0) {
    return <p className="muted meeting-empty-detail">No links</p>;
  }

  return (
    <div className="meeting-link-list">
      {meeting.links.map((link) => (
        <a href={link.url} key={`${link.linkType}-${link.url}`} rel="noreferrer" target="_blank">
          <LinkIcon aria-hidden="true" size={15} />
          <span>{link.label}</span>
          <small>{linkTypeLabel(link.linkType)}</small>
        </a>
      ))}
    </div>
  );
}

function CheckboxGroup({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: Array<{ publicId: string; label: ReactNode }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="checkbox-group">
      <legend>{legend}</legend>
      <div className="checkbox-group-summary">
        <span>
          {selected.length > 0
            ? `${selected.length} selected`
            : "None selected"}
        </span>
        {selected.length > 0 ? (
          <button className="link-button" type="button" onClick={() => onChange([])}>
            Clear
          </button>
        ) : null}
      </div>
      {options.length === 0 ? (
        <span className="muted checkbox-group-empty">None</span>
      ) : (
        <div className="checkbox-option-list">
          {options.map((option) => (
            <label key={option.publicId}>
              <input
                type="checkbox"
                checked={selected.includes(option.publicId)}
                onChange={(event) =>
                  onChange(toggleValue(selected, option.publicId, event.target.checked))
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export function MeetingsPage({
  focusMeetingPublicId,
  onMeetingFocusHandled,
}: {
  focusMeetingPublicId?: string | null;
  onMeetingFocusHandled?: () => void;
}) {
  const [meetings, setMeetings] = useState<MeetingDto[]>([]);
  const [series, setSeries] = useState<MeetingSeriesDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [meetingArchiveView, setMeetingArchiveView] = useState<MeetingArchiveView>("active");
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);
  const [calendarImportQuery, setCalendarImportQuery] = useState("");
  const [calendarImportEvents, setCalendarImportEvents] = useState<GoogleCalendarImportEventDto[]>(
    [],
  );
  const [calendarImportError, setCalendarImportError] = useState("");
  const [calendarImportLoading, setCalendarImportLoading] = useState(false);
  const [calendarImportDetails, setCalendarImportDetails] =
    useState<CalendarImportDetails | null>(null);
  const [seriesForm, setSeriesForm] = useState<SeriesFormState>(emptySeriesForm);
  const [occurrenceForm, setOccurrenceForm] =
    useState<OccurrenceFormState>(emptyOccurrenceForm);
  const [meetingTaskForms, setMeetingTaskForms] = useState<Record<string, MeetingTaskFormState>>({});
  const [editingMeetingPublicId, setEditingMeetingPublicId] = useState<string | null>(null);
  const [meetingEditForm, setMeetingEditForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [expandedMeetingPublicIds, setExpandedMeetingPublicIds] = useState<Record<string, boolean>>(
    {},
  );
  const [meetingAudits, setMeetingAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [activeNotesMeetingPublicId, setActiveNotesMeetingPublicId] = useState<string | null>(null);
  const [blockersDraft, setBlockersDraft] = useState("");
  const [blockersClearedDraft, setBlockersClearedDraft] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [linkDrafts, setLinkDrafts] = useState<MeetingLinkFormState[]>([]);
  const [newLinkForm, setNewLinkForm] = useState<MeetingLinkFormState>(emptyMeetingLinkForm);
  const meetingLoadRequestId = useRef(0);

  const meetingQuery = useMemo(
    () => (meetingArchiveView === "archived" ? "?archived=true" : ""),
    [meetingArchiveView],
  );

  const meetingLanes = useMemo<MeetingLane[]>(() => {
    if (meetingArchiveView === "archived") {
      return meetings.length > 0
        ? [
            {
              key: "archived",
              title: "Archived",
              ariaLabel: "Archived meetings",
              tone: "neutral",
              meetings,
            },
          ]
        : [];
    }

    const now = Date.now();
    const blocked = meetings
      .filter((meeting) => hasActiveBlockers(meeting))
      .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());
    const upcoming = meetings
      .filter((meeting) => !hasActiveBlockers(meeting) && new Date(meeting.startsAt).getTime() >= now)
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
    const past = meetings
      .filter((meeting) => !hasActiveBlockers(meeting) && new Date(meeting.startsAt).getTime() < now)
      .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());

    const lanes: MeetingLane[] = [
      {
        key: "blockers",
        title: "Blockers",
        ariaLabel: "Meetings with blockers",
        tone: "bad",
        meetings: blocked,
      },
      {
        key: "upcoming",
        title: "Upcoming",
        ariaLabel: "Upcoming meetings",
        tone: "info",
        meetings: upcoming,
      },
      {
        key: "past",
        title: "Past",
        ariaLabel: "Past meetings",
        tone: "neutral",
        meetings: past,
      },
    ];

    return lanes.filter((lane) => lane.meetings.length > 0);
  }, [meetingArchiveView, meetings]);

  const activeNotesMeeting = useMemo(
    () => meetings.find((meeting) => meeting.publicId === activeNotesMeetingPublicId) ?? null,
    [activeNotesMeetingPublicId, meetings],
  );

  async function load() {
    const requestId = meetingLoadRequestId.current + 1;
    meetingLoadRequestId.current = requestId;
    const [meetingResult, seriesResult, peopleResult, taskResult] = await Promise.all([
      api.meetings.list(meetingQuery),
      api.series.list(),
      api.people.list(),
      api.tasks.list(),
    ]);
    const auditEntries = await Promise.all(
      meetingResult.meetings.map(async (meeting) => {
        const auditResult = await api.meetings
          .audit(meeting.publicId)
          .catch(() => ({ auditEvents: [] as AuditLogDto[] }));
        return [meeting.publicId, auditResult.auditEvents ?? []] as const;
      }),
    );
    if (requestId !== meetingLoadRequestId.current) return;
    setMeetings([...meetingResult.meetings]);
    setSeries([...seriesResult.series]);
    setPeople([...peopleResult.people]);
    setTasks([...taskResult.tasks]);
    setMeetingAudits(Object.fromEntries(auditEntries));
  }

  useEffect(() => {
    void load();
  }, [meetingQuery]);

  async function resolveAttendeePublicIds(selectedIds: string[], attendeeNames: string) {
    const attendeeIds = new Set(selectedIds);
    const personIdByName = new Map(
      people.map((person) => [person.name.trim().toLowerCase(), person.publicId]),
    );

    for (const name of parseAttendeeNames(attendeeNames)) {
      const key = name.toLowerCase();
      const existingPublicId = personIdByName.get(key);
      if (existingPublicId) {
        attendeeIds.add(existingPublicId);
        continue;
      }

      const result = await api.people.create({ name });
      personIdByName.set(key, result.person.publicId);
      attendeeIds.add(result.person.publicId);
    }

    return [...attendeeIds];
  }

  async function submitSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.series.create(seriesForm);
    setSeriesForm(emptySeriesForm);
    await load();
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attendeePublicIds = await resolveAttendeePublicIds(
      meetingForm.attendeePublicIds,
      meetingForm.attendeeNames,
    );
    const body = {
      title: meetingForm.title,
      startsAt: toApiDateTime(meetingForm.startsAt),
      meetingType: meetingForm.meetingType,
      seriesPublicId:
        meetingForm.meetingType === "recurring" ? meetingForm.seriesPublicId || null : null,
      summary: meetingForm.summary,
      notes: calendarImportDetails?.notes ?? "",
      links: calendarImportDetails?.links ?? [],
      attendeePublicIds,
      taskPublicIds: meetingForm.taskPublicIds,
      private: meetingForm.private,
    };

    await api.meetings.create(body);
    setMeetingForm(emptyMeetingForm);
    setCalendarImportDetails(null);
    await load();
  }

  async function searchGoogleCalendarEvents() {
    setCalendarImportLoading(true);
    setCalendarImportError("");
    try {
      const result = await api.googleCalendar.searchEvents(calendarImportQuery);
      setCalendarImportEvents(result.events);
      if (result.events.length === 0) {
        setCalendarImportError("No matching Google Calendar events.");
      }
    } catch (error) {
      setCalendarImportEvents([]);
      setCalendarImportError(
        error instanceof Error ? error.message : "Google Calendar could not be searched.",
      );
    } finally {
      setCalendarImportLoading(false);
    }
  }

  function applyGoogleCalendarEvent(event: GoogleCalendarImportEventDto) {
    const attendeeNames = [meetingForm.attendeeNames, event.attendeeNames]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ");

    setMeetingForm({
      ...meetingForm,
      title: event.title,
      startsAt: toDateTimeInputValue(event.startsAt),
      meetingType: "single",
      seriesPublicId: "",
      summary: event.summary,
      attendeeNames,
    });
    setCalendarImportDetails({
      sourceTitle: event.title,
      notes: event.notes,
      links: event.links,
    });
    setCalendarImportOpen(false);
    setCalendarImportError("");
  }

  async function submitOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attendeePublicIds = await resolveAttendeePublicIds(
      occurrenceForm.attendeePublicIds,
      occurrenceForm.attendeeNames,
    );
    await api.series.createOccurrence(occurrenceForm.seriesPublicId, {
      title: occurrenceForm.title,
      startsAt: toApiDateTime(occurrenceForm.startsAt),
      summary: occurrenceForm.summary,
      blockers: occurrenceForm.blockers,
      blockersCleared: occurrenceForm.blockersCleared,
      attendeePublicIds,
      private: occurrenceForm.private,
    });
    setOccurrenceForm(emptyOccurrenceForm);
    await load();
  }

  function editMeeting(meeting: MeetingDto) {
    expandMeeting(meeting.publicId);
    setEditingMeetingPublicId(meeting.publicId);
    setMeetingEditForm({
      publicId: meeting.publicId,
      title: meeting.title,
      startsAt: toDateTimeInputValue(meeting.startsAt),
      meetingType: meeting.meetingType,
      seriesPublicId: meeting.seriesPublicId ?? "",
      summary: meeting.summary,
      blockers: meeting.blockers,
      blockersCleared: meeting.blockersClearedAt !== null,
      attendeePublicIds: meeting.attendees.map((attendee) => attendee.publicId),
      attendeeNames: "",
      taskPublicIds: meeting.tasks.map((task) => task.publicId),
      private: meeting.private,
    });
  }

  function expandMeeting(meetingPublicId: string) {
    setExpandedMeetingPublicIds((current) =>
      current[meetingPublicId] ? current : { ...current, [meetingPublicId]: true },
    );
  }

  function toggleMeeting(meetingPublicId: string) {
    setExpandedMeetingPublicIds((current) => ({
      ...current,
      [meetingPublicId]: !current[meetingPublicId],
    }));
  }

  useEffect(() => {
    if (!focusMeetingPublicId) return;
    const meeting = meetings.find((item) => item.publicId === focusMeetingPublicId);
    if (!meeting) return;

    editMeeting(meeting);
    scrollRecordIntoView(`meeting-${meeting.publicId}`);
    onMeetingFocusHandled?.();
  }, [focusMeetingPublicId, meetings, onMeetingFocusHandled]);

  async function submitMeetingEdit(event: FormEvent<HTMLFormElement>, meeting: MeetingDto) {
    event.preventDefault();
    const attendeePublicIds = await resolveAttendeePublicIds(
      meetingEditForm.attendeePublicIds,
      meetingEditForm.attendeeNames,
    );
    await api.meetings.update(meeting.publicId, {
      title: meetingEditForm.title,
      startsAt: toApiDateTime(meetingEditForm.startsAt),
      meetingType: meetingEditForm.meetingType,
      seriesPublicId:
        meetingEditForm.meetingType === "recurring"
          ? meetingEditForm.seriesPublicId || null
          : null,
      summary: meetingEditForm.summary,
      blockers: meetingEditForm.blockers,
      blockersCleared: meetingEditForm.blockersCleared,
      notes: meeting.notes,
      links: meeting.links.map(toMeetingLinkForm),
      attendeePublicIds,
      taskPublicIds: meetingEditForm.taskPublicIds,
      private: meetingEditForm.private,
    });
    setEditingMeetingPublicId(null);
    setMeetingEditForm(emptyMeetingForm);
    await load();
  }

  async function archiveMeeting(meeting: MeetingDto) {
    const confirmed = window.confirm(
      `Archive meeting ${meeting.publicId}? You can restore it later.`,
    );
    if (!confirmed) return;

    await api.meetings.archive(meeting.publicId);
    setEditingMeetingPublicId(null);
    setMeetingEditForm(emptyMeetingForm);
    setExpandedMeetingPublicIds((current) => {
      const next = { ...current };
      delete next[meeting.publicId];
      return next;
    });
    await load();
  }

  async function restoreMeeting(meeting: MeetingDto) {
    await api.meetings.restore(meeting.publicId);
    setExpandedMeetingPublicIds((current) => {
      const next = { ...current };
      delete next[meeting.publicId];
      return next;
    });
    await load();
  }

  function getMeetingTaskForm(meetingPublicId: string) {
    return meetingTaskForms[meetingPublicId] ?? emptyMeetingTaskForm;
  }

  function updateMeetingTaskForm(
    meetingPublicId: string,
    changes: Partial<MeetingTaskFormState>,
  ) {
    setMeetingTaskForms((current) => ({
      ...current,
      [meetingPublicId]: {
        ...(current[meetingPublicId] ?? emptyMeetingTaskForm),
        ...changes,
      },
    }));
  }

  async function submitMeetingTask(event: FormEvent<HTMLFormElement>, meeting: MeetingDto) {
    event.preventDefault();
    const form = getMeetingTaskForm(meeting.publicId);
    await api.tasks.create({
      description: form.description,
      blockers: form.blockers,
      notes: form.notes,
      blockersCleared: form.blockersCleared,
      assigneePublicId: form.assigneePublicId || null,
      status: form.status,
      dueDate: form.dueDate || null,
      originMeetingPublicId: meeting.publicId,
      seriesPublicId: meeting.seriesPublicId,
      private: form.private,
    });
    setMeetingTaskForms((current) => ({
      ...current,
      [meeting.publicId]: emptyMeetingTaskForm,
    }));
    await load();
  }

  function openMeetingNotes(meeting: MeetingDto) {
    setActiveNotesMeetingPublicId(meeting.publicId);
    setEditingMeetingPublicId(null);
    setBlockersDraft(meeting.blockers);
    setBlockersClearedDraft(meeting.blockersClearedAt !== null);
    setNotesDraft(meeting.notes);
    setLinkDrafts(meeting.links.map(toMeetingLinkForm));
    setNewLinkForm(emptyMeetingLinkForm);
  }

  function closeMeetingNotes() {
    setActiveNotesMeetingPublicId(null);
    setBlockersDraft("");
    setBlockersClearedDraft(false);
    setNotesDraft("");
    setLinkDrafts([]);
    setNewLinkForm(emptyMeetingLinkForm);
  }

  function updateLinkDraft(index: number, changes: Partial<MeetingLinkFormState>) {
    setLinkDrafts((current) =>
      current.map((link, currentIndex) =>
        currentIndex === index ? { ...link, ...changes } : link,
      ),
    );
  }

  function removeLinkDraft(index: number) {
    setLinkDrafts((current) => current.filter((_link, currentIndex) => currentIndex !== index));
  }

  function addLinkDraft() {
    setLinkDrafts((current) => [...current, newLinkForm]);
    setNewLinkForm(emptyMeetingLinkForm);
  }

  async function submitMeetingNotes(event: FormEvent<HTMLFormElement>, meeting: MeetingDto) {
    event.preventDefault();
    const pendingLink =
      newLinkForm.label.trim() && newLinkForm.url.trim() ? [newLinkForm] : [];
    const links = [...linkDrafts, ...pendingLink];
    await api.meetings.update(meeting.publicId, {
      title: meeting.title,
      startsAt: meeting.startsAt,
      meetingType: meeting.meetingType,
      seriesPublicId: meeting.seriesPublicId,
      summary: meeting.summary,
      blockers: blockersDraft,
      blockersCleared: blockersClearedDraft,
      notes: notesDraft,
      links,
      attendeePublicIds: meeting.attendees.map((attendee) => attendee.publicId),
      taskPublicIds: meeting.tasks.map((task) => task.publicId),
      private: meeting.private,
    });
    setLinkDrafts(links);
    setNewLinkForm(emptyMeetingLinkForm);
    await load();
  }

  if (activeNotesMeeting) {
    return (
      <main className="page meeting-notes-page">
        <header className="page-header meeting-notes-header">
          <div className="meeting-notes-titlebar">
            <button
              className="secondary-button icon-text-button"
              type="button"
              onClick={closeMeetingNotes}
            >
              <ArrowLeft aria-hidden="true" size={17} />
              Back
            </button>
            <div>
              <h2>{activeNotesMeeting.title}</h2>
              <p>
                {activeNotesMeeting.publicId} ·{" "}
                {new Date(activeNotesMeeting.startsAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            className="primary-button icon-text-button"
            type="submit"
            form={`meeting-notes-form-${activeNotesMeeting.publicId}`}
          >
            <Save aria-hidden="true" size={17} />
            Save notes
          </button>
        </header>

        <form
          className="meeting-notes-layout"
          id={`meeting-notes-form-${activeNotesMeeting.publicId}`}
          onSubmit={(event) => submitMeetingNotes(event, activeNotesMeeting)}
        >
          <section className="meeting-notes-editor" aria-label="Meeting note entry">
            <div className="meeting-notes-meta">
              <StatusBadge label={activeNotesMeeting.meetingType} />
              {activeNotesMeeting.seriesPublicId ? (
                <span>Series {activeNotesMeeting.seriesPublicId}</span>
              ) : null}
              <span>
                {activeNotesMeeting.attendees.length > 0
                  ? activeNotesMeeting.attendees.map((attendee) => attendee.name).join(", ")
                  : "No attendees"}
              </span>
              {hasActiveBlockers(activeNotesMeeting) ? (
                <StatusBadge label="Blocker" tone="bad" />
              ) : null}
              {hasClearedBlockers(activeNotesMeeting) ? (
                <StatusBadge label="Blocker cleared" tone="good" />
              ) : null}
            </div>
            <FormField label={`Blockers for ${activeNotesMeeting.publicId}`}>
              <textarea
                className="meeting-blockers-textarea"
                value={blockersDraft}
                onChange={(event) => {
                  setBlockersDraft(event.target.value);
                  if (!event.target.value.trim()) setBlockersClearedDraft(false);
                }}
              />
            </FormField>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={blockersClearedDraft}
                disabled={!blockersDraft.trim()}
                onChange={(event) => setBlockersClearedDraft(event.target.checked)}
              />
              <span>Blocker cleared</span>
            </label>
            <FormField label={`Notes for ${activeNotesMeeting.publicId}`}>
              <textarea
                autoFocus
                className="meeting-notes-textarea"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
              />
            </FormField>
          </section>

          <aside className="meeting-notes-sidepanel">
            <section className="notes-panel" aria-label="Structured meeting links">
              <header className="notes-panel-header">
                <h3>Links</h3>
                <span className="lane-count">{countLabel(linkDrafts.length, "link")}</span>
              </header>
              {linkDrafts.length === 0 ? (
                <p className="muted">No links</p>
              ) : (
                <div className="structured-link-list">
                  {linkDrafts.map((link, index) => (
                    <div className="structured-link-row" key={`${link.url}-${index}`}>
                      <FormField label={`Link label ${index + 1}`}>
                        <input
                          value={link.label}
                          onChange={(event) =>
                            updateLinkDraft(index, { label: event.target.value })
                          }
                          required
                        />
                      </FormField>
                      <FormField label={`Link URL ${index + 1}`}>
                        <input
                          type="url"
                          value={link.url}
                          onChange={(event) =>
                            updateLinkDraft(index, { url: event.target.value })
                          }
                          required
                        />
                      </FormField>
                      <FormField label={`Link type ${index + 1}`}>
                        <select
                          value={link.linkType}
                          onChange={(event) =>
                            updateLinkDraft(index, {
                              linkType: event.target.value as MeetingLinkType,
                            })
                          }
                        >
                          {meetingLinkTypes.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <div className="structured-link-actions">
                        <a
                          className="secondary-button icon-text-button structured-link-preview"
                          href={link.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <LinkIcon aria-hidden="true" size={16} />
                          Open
                        </a>
                        <button
                          aria-label={`Remove ${linkTypeLabel(link.linkType)} link ${link.label || index + 1}`}
                          className="icon-button"
                          type="button"
                          onClick={() => removeLinkDraft(index)}
                        >
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="link-add-grid">
                <FormField label="New link label">
                  <input
                    value={newLinkForm.label}
                    onChange={(event) =>
                      setNewLinkForm({ ...newLinkForm, label: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="New link URL">
                  <input
                    type="url"
                    value={newLinkForm.url}
                    onChange={(event) =>
                      setNewLinkForm({ ...newLinkForm, url: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="New link type">
                  <select
                    value={newLinkForm.linkType}
                    onChange={(event) =>
                      setNewLinkForm({
                        ...newLinkForm,
                        linkType: event.target.value as MeetingLinkType,
                      })
                    }
                  >
                    {meetingLinkTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <button
                  className="secondary-button icon-text-button"
                  disabled={!newLinkForm.label.trim() || !newLinkForm.url.trim()}
                  type="button"
                  onClick={addLinkDraft}
                >
                  <Plus aria-hidden="true" size={16} />
                  Add link
                </button>
              </div>
            </section>

            <section className="notes-panel" aria-label="Meeting work">
              <header className="notes-panel-header">
                <h3>Work</h3>
                <span className="lane-count">{countLabel(activeNotesMeeting.tasks.length, "task")}</span>
              </header>
              {activeNotesMeeting.tasks.length === 0 ? (
                <p className="muted">No tasks</p>
              ) : (
                <div className="task-links">
                  {activeNotesMeeting.tasks.map((task) => (
                    <span key={task.publicId}>
                      <strong>{task.publicId}</strong> <LinkedText text={task.description} />
                      {hasActiveBlockers(task) ? <StatusBadge label="Blocker" tone="bad" /> : null}
                      {hasClearedBlockers(task) ? (
                        <StatusBadge label="Blocker cleared" tone="good" />
                      ) : null}
                      {hasBlockers(task) ? (
                        <small className="task-link-blocker">
                          <LinkedText text={task.blockers} />
                        </small>
                      ) : null}
                      {(task.notes ?? "").trim() ? (
                        <small className="task-link-notes">
                          <LinkedText text={task.notes} />
                        </small>
                      ) : null}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h2>Meetings</h2>
        <div className="record-view-toggle" role="group" aria-label="Meeting archive view">
          <button
            aria-pressed={meetingArchiveView === "active"}
            className={meetingArchiveView === "active" ? "active" : ""}
            type="button"
            onClick={() => setMeetingArchiveView("active")}
          >
            Active
          </button>
          <button
            aria-pressed={meetingArchiveView === "archived"}
            className={meetingArchiveView === "archived" ? "active" : ""}
            type="button"
            onClick={() => setMeetingArchiveView("archived")}
          >
            Archived
          </button>
        </div>
      </header>
      {meetingArchiveView === "active" ? (
      <>
      <div className="form-grid meeting-tools-grid">
        <form className="editor-form meeting-tool-form" onSubmit={submitSeries}>
          <h3>Meeting series</h3>
          <FormField label="Series title">
            <input
              value={seriesForm.title}
              onChange={(event) => setSeriesForm({ ...seriesForm, title: event.target.value })}
              required
            />
          </FormField>
          <FormField label="Cadence">
            <input
              value={seriesForm.cadenceLabel}
              onChange={(event) =>
                setSeriesForm({ ...seriesForm, cadenceLabel: event.target.value })
              }
              placeholder="Weekly"
            />
          </FormField>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={seriesForm.active}
              onChange={(event) =>
                setSeriesForm({ ...seriesForm, active: event.target.checked })
              }
            />
            <span>Active</span>
          </label>
          <button className="primary-button" type="submit">
            Add series
          </button>
        </form>
        <form className="editor-form meeting-tool-form" onSubmit={submitOccurrence}>
          <h3>Next occurrence</h3>
          <FormField label="Occurrence series">
            <select
              value={occurrenceForm.seriesPublicId}
              onChange={(event) =>
                setOccurrenceForm({ ...occurrenceForm, seriesPublicId: event.target.value })
              }
              required
            >
              <option value="">Choose series</option>
              {series.map((item) => (
                <option key={item.publicId} value={item.publicId}>
                  {collapseLinks(item.title)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Occurrence start">
            <input
              type="datetime-local"
              value={occurrenceForm.startsAt}
              onChange={(event) =>
                setOccurrenceForm({ ...occurrenceForm, startsAt: event.target.value })
              }
              required
            />
          </FormField>
          <FormField label="Occurrence title">
            <input
              value={occurrenceForm.title}
              onChange={(event) =>
                setOccurrenceForm({ ...occurrenceForm, title: event.target.value })
              }
            />
          </FormField>
          <FormField label="Occurrence summary">
            <textarea
              value={occurrenceForm.summary}
              onChange={(event) =>
                setOccurrenceForm({ ...occurrenceForm, summary: event.target.value })
              }
            />
          </FormField>
          <FormField label="Occurrence blockers">
            <textarea
              value={occurrenceForm.blockers}
              onChange={(event) =>
                setOccurrenceForm({
                  ...occurrenceForm,
                  blockers: event.target.value,
                  blockersCleared: event.target.value.trim()
                    ? occurrenceForm.blockersCleared
                    : false,
                })
              }
            />
          </FormField>
          <CheckboxGroup
            legend="Existing occurrence attendees"
            options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
            selected={occurrenceForm.attendeePublicIds}
            onChange={(attendeePublicIds) =>
              setOccurrenceForm({ ...occurrenceForm, attendeePublicIds })
            }
          />
          <FormField label="Occurrence attendee names">
            <input
              value={occurrenceForm.attendeeNames}
              onChange={(event) =>
                setOccurrenceForm({ ...occurrenceForm, attendeeNames: event.target.value })
              }
              placeholder="Morgan, Taylor"
            />
          </FormField>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={occurrenceForm.private}
              onChange={(event) =>
                setOccurrenceForm({ ...occurrenceForm, private: event.target.checked })
              }
            />
            <span>Private</span>
          </label>
          <button className="primary-button" type="submit">
            Create occurrence
          </button>
        </form>
      </div>
      <form className="editor-form" id="meeting-editor" onSubmit={submitMeeting}>
        <div className="editor-form-title-row">
          <h3>Add meeting</h3>
          <button
            className="secondary-button icon-text-button"
            type="button"
            onClick={() => setCalendarImportOpen((open) => !open)}
          >
            <CalendarPlus aria-hidden="true" size={17} />
            Import from Google Calendar
          </button>
        </div>
        {calendarImportOpen ? (
          <section className="calendar-import-panel" aria-label="Import from Google Calendar">
            <FormField label="Which Google Calendar meeting?">
              <input
                value={calendarImportQuery}
                onChange={(event) => setCalendarImportQuery(event.target.value)}
                placeholder="Search by title, attendee, or detail"
              />
            </FormField>
            <button
              className="secondary-button icon-text-button"
              type="button"
              onClick={searchGoogleCalendarEvents}
              disabled={calendarImportLoading}
            >
              <CalendarPlus aria-hidden="true" size={17} />
              {calendarImportLoading ? "Searching" : "Find meetings"}
            </button>
            {calendarImportError ? (
              <p className="form-error" role="status">
                {calendarImportError}
              </p>
            ) : null}
            {calendarImportEvents.length > 0 ? (
              <div className="calendar-import-results">
                {calendarImportEvents.map((event) => (
                  <button
                    className="calendar-import-result"
                    key={event.id}
                    type="button"
                    onClick={() => applyGoogleCalendarEvent(event)}
                  >
                    <strong>{event.title}</strong>
                    <span>{new Date(event.startsAt).toLocaleString()}</span>
                    <span>{event.attendeeNames || event.summary || "No extra details"}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {calendarImportDetails ? (
          <section className="calendar-import-preview" aria-label="Imported Google Calendar details">
            <strong>Imported from Google Calendar</strong>
            <span>{calendarImportDetails.sourceTitle}</span>
            <span>{countLabel(calendarImportDetails.links.length, "link")}</span>
          </section>
        ) : null}
        <FormField label="Meeting title">
          <input
            value={meetingForm.title}
            onChange={(event) => setMeetingForm({ ...meetingForm, title: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Meeting start">
          <input
            type="datetime-local"
            value={meetingForm.startsAt}
            onChange={(event) => setMeetingForm({ ...meetingForm, startsAt: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Meeting type">
          <select
            value={meetingForm.meetingType}
            onChange={(event) =>
              setMeetingForm({
                ...meetingForm,
                meetingType: event.target.value as MeetingType,
                seriesPublicId: event.target.value === "single" ? "" : meetingForm.seriesPublicId,
              })
            }
          >
            <option value="single">Single</option>
            <option value="recurring">Recurring</option>
          </select>
        </FormField>
        <FormField label="Meeting series">
          <select
            value={meetingForm.seriesPublicId}
            onChange={(event) =>
              setMeetingForm({ ...meetingForm, seriesPublicId: event.target.value })
            }
            required={meetingForm.meetingType === "recurring"}
            disabled={meetingForm.meetingType === "single"}
          >
            <option value="">No series</option>
            {series.map((item) => (
              <option key={item.publicId} value={item.publicId}>
                {collapseLinks(item.title)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Meeting summary">
          <textarea
            value={meetingForm.summary}
            onChange={(event) => setMeetingForm({ ...meetingForm, summary: event.target.value })}
          />
        </FormField>
        <FormField label="Meeting blockers">
          <textarea
            value={meetingForm.blockers}
            onChange={(event) =>
              setMeetingForm({
                ...meetingForm,
                blockers: event.target.value,
                blockersCleared: event.target.value.trim() ? meetingForm.blockersCleared : false,
              })
            }
          />
        </FormField>
        <CheckboxGroup
          legend="Existing attendees"
          options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
          selected={meetingForm.attendeePublicIds}
          onChange={(attendeePublicIds) =>
            setMeetingForm({ ...meetingForm, attendeePublicIds })
          }
        />
        <FormField label="New attendee names">
          <input
            value={meetingForm.attendeeNames}
            onChange={(event) => setMeetingForm({ ...meetingForm, attendeeNames: event.target.value })}
            placeholder="Morgan, Taylor"
          />
        </FormField>
        <CheckboxGroup
          legend="Meeting tasks"
          options={tasks.map((task) => ({
            publicId: task.publicId,
            label: taskOptionLabel(task),
          }))}
          selected={meetingForm.taskPublicIds}
          onChange={(taskPublicIds) => setMeetingForm({ ...meetingForm, taskPublicIds })}
        />
        <div className="form-actions">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={meetingForm.private}
              onChange={(event) =>
                setMeetingForm({ ...meetingForm, private: event.target.checked })
              }
            />
            <span>Private</span>
          </label>
          <button className="primary-button" type="submit">
            Add meeting
          </button>
        </div>
      </form>
      </>
      ) : null}
      {meetings.length === 0 ? (
        <EmptyState
          title={meetingArchiveView === "archived" ? "No archived meetings" : "No meetings"}
          detail={
            meetingArchiveView === "archived"
              ? "Archived meetings will appear here when you need to retrieve old context."
              : "Create a single meeting or start a recurring series."
          }
        />
      ) : (
        <div className="lane-stack">
          {meetingArchiveView === "active" && series.length > 0 ? (
            <section aria-label="Recurring series" className="record-lane record-lane-meeting">
              <header className="lane-header">
                <div>
                  <h3>Recurring series</h3>
                  <p>Active meeting rhythms</p>
                </div>
                <span className="lane-count">{countLabel(series.length, "series")}</span>
              </header>
              <div className="series-list">
                {series.map((item) => (
                  <div className="series-row" key={item.publicId}>
                    <div>
                      <strong>
                        <LinkedText text={item.title} />
                      </strong>
                      <span>{item.publicId}</span>
                    </div>
                    <span className="hint-chip hint-chip-teal">
                      {item.cadenceLabel || "Recurring"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {meetingLanes.map((lane) => (
            <section
              aria-label={lane.ariaLabel}
              className={`record-lane record-lane-${lane.tone}`}
              key={lane.key}
            >
              <header className="lane-header">
                <div>
                  <h3>{lane.title}</h3>
                  <p>{lane.ariaLabel}</p>
                </div>
                <span className="lane-count">{countLabel(lane.meetings.length, "meeting")}</span>
              </header>
              <div className="record-list">
                {lane.meetings.map((meeting) => (
            <article
              aria-label={`Meeting ${meeting.publicId}`}
              className="meeting-card record-card-meeting"
              id={`meeting-${meeting.publicId}`}
              key={meeting.publicId}
            >
              <div className="record-row meeting-row">
                <div>
                  <strong>
                    <LinkedText text={meeting.title} />
                  </strong>
                  <span>{meeting.publicId}</span>
                </div>
                <StatusBadge label={meeting.meetingType} />
                {meeting.private ? <StatusBadge label="Private" tone="warn" /> : null}
                <span>{new Date(meeting.startsAt).toLocaleString()}</span>
                <span>{meeting.summary ? <LinkedText text={meeting.summary} /> : "No summary"}</span>
                <span>
                  {meeting.attendees.length > 0
                    ? meeting.attendees.map((attendee) => attendee.name).join(", ")
                    : "No attendees"}
                </span>
                <div className="task-links">
                  {meeting.tasks.length === 0 ? (
                    <span>No tasks</span>
                  ) : (
                    meeting.tasks.map((task) => (
                      <span key={task.publicId}>
                        <strong>{task.publicId}</strong> <LinkedText text={task.description} />
                      </span>
                    ))
                  )}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openMeetingNotes(meeting)}
                  aria-label={`Open notes for ${meeting.publicId}`}
                >
                  Notes
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => editMeeting(meeting)}
                  aria-label={`Edit details for ${meeting.publicId}`}
                >
                  Edit details
                </button>
              </div>
              {editingMeetingPublicId === meeting.publicId ? (
                <form
                  className="meeting-edit-form"
                  onSubmit={(event) => submitMeetingEdit(event, meeting)}
                >
                  <h3>Edit details for {meeting.publicId}</h3>
                  <FormField label={`Meeting title for ${meeting.publicId}`}>
                    <input
                      value={meetingEditForm.title}
                      onChange={(event) =>
                        setMeetingEditForm({ ...meetingEditForm, title: event.target.value })
                      }
                      required
                    />
                  </FormField>
                  <FormField label={`Meeting start for ${meeting.publicId}`}>
                    <input
                      type="datetime-local"
                      value={meetingEditForm.startsAt}
                      onChange={(event) =>
                        setMeetingEditForm({ ...meetingEditForm, startsAt: event.target.value })
                      }
                      required
                    />
                  </FormField>
                  <FormField label={`Meeting type for ${meeting.publicId}`}>
                    <select
                      value={meetingEditForm.meetingType}
                      onChange={(event) =>
                        setMeetingEditForm({
                          ...meetingEditForm,
                          meetingType: event.target.value as MeetingType,
                          seriesPublicId:
                            event.target.value === "single" ? "" : meetingEditForm.seriesPublicId,
                        })
                      }
                    >
                      <option value="single">Single</option>
                      <option value="recurring">Recurring</option>
                    </select>
                  </FormField>
                  <FormField label={`Meeting series for ${meeting.publicId}`}>
                    <select
                      value={meetingEditForm.seriesPublicId}
                      onChange={(event) =>
                        setMeetingEditForm({
                          ...meetingEditForm,
                          seriesPublicId: event.target.value,
                        })
                      }
                      required={meetingEditForm.meetingType === "recurring"}
                      disabled={meetingEditForm.meetingType === "single"}
                    >
                      <option value="">No series</option>
                      {series.map((item) => (
                        <option key={item.publicId} value={item.publicId}>
                          {collapseLinks(item.title)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label={`Meeting summary for ${meeting.publicId}`}>
                    <textarea
                      value={meetingEditForm.summary}
                      onChange={(event) =>
                        setMeetingEditForm({ ...meetingEditForm, summary: event.target.value })
                      }
                    />
                  </FormField>
                  <FormField label={`Meeting blockers for ${meeting.publicId}`}>
                    <textarea
                      value={meetingEditForm.blockers}
                      onChange={(event) =>
                        setMeetingEditForm({
                          ...meetingEditForm,
                          blockers: event.target.value,
                          blockersCleared: event.target.value.trim()
                            ? meetingEditForm.blockersCleared
                            : false,
                        })
                      }
                    />
                  </FormField>
                  <CheckboxGroup
                    legend={`Existing attendees for ${meeting.publicId}`}
                    options={people.map((person) => ({
                      publicId: person.publicId,
                      label: person.name,
                    }))}
                    selected={meetingEditForm.attendeePublicIds}
                    onChange={(attendeePublicIds) =>
                      setMeetingEditForm({ ...meetingEditForm, attendeePublicIds })
                    }
                  />
                  <FormField label={`New attendee names for ${meeting.publicId}`}>
                    <input
                      value={meetingEditForm.attendeeNames}
                      onChange={(event) =>
                        setMeetingEditForm({
                          ...meetingEditForm,
                          attendeeNames: event.target.value,
                        })
                      }
                      placeholder="Morgan, Taylor"
                    />
                  </FormField>
                  <CheckboxGroup
                    legend={`Meeting tasks for ${meeting.publicId}`}
                    options={tasks.map((task) => ({
                      publicId: task.publicId,
                      label: taskOptionLabel(task),
                    }))}
                    selected={meetingEditForm.taskPublicIds}
                    onChange={(taskPublicIds) =>
                      setMeetingEditForm({ ...meetingEditForm, taskPublicIds })
                    }
                  />
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={meetingEditForm.private}
                      onChange={(event) =>
                        setMeetingEditForm({
                          ...meetingEditForm,
                          private: event.target.checked,
                        })
                      }
                    />
                    <span>Private</span>
                  </label>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={meetingEditForm.blockersCleared}
                      disabled={!meetingEditForm.blockers.trim()}
                      onChange={(event) =>
                        setMeetingEditForm({
                          ...meetingEditForm,
                          blockersCleared: event.target.checked,
                        })
                      }
                    />
                    <span>Blocker cleared</span>
                  </label>
                  <div className="form-actions">
                    <button className="primary-button" type="submit">
                      Save meeting {meeting.publicId}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setEditingMeetingPublicId(null);
                        setMeetingEditForm(emptyMeetingForm);
                      }}
                    >
                      Cancel edit {meeting.publicId}
                    </button>
                    <button
                      className="danger-button icon-text-button"
                      type="button"
                      onClick={() => archiveMeeting(meeting)}
                    >
                      <Archive aria-hidden="true" size={16} />
                      Archive meeting {meeting.publicId}
                    </button>
                  </div>
                </form>
              ) : null}
              {!meeting.archived ? (
              <form className="meeting-task-form" onSubmit={(event) => submitMeetingTask(event, meeting)}>
                <h3>Add task to {meeting.publicId}</h3>
                <FormField label={`New task description for ${meeting.publicId}`}>
                  <input
                    value={getMeetingTaskForm(meeting.publicId).description}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        description: event.target.value,
                      })
                    }
                    required
                  />
                </FormField>
                <FormField label={`New task blockers for ${meeting.publicId}`}>
                  <textarea
                    value={getMeetingTaskForm(meeting.publicId).blockers}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        blockers: event.target.value,
                        blockersCleared: event.target.value.trim()
                          ? getMeetingTaskForm(meeting.publicId).blockersCleared
                          : false,
                      })
                    }
                  />
                </FormField>
                <FormField label={`New task notes for ${meeting.publicId}`}>
                  <textarea
                    value={getMeetingTaskForm(meeting.publicId).notes}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        notes: event.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label={`New task assignee for ${meeting.publicId}`}>
                  <select
                    value={getMeetingTaskForm(meeting.publicId).assigneePublicId}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        assigneePublicId: event.target.value,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {people.map((person) => (
                      <option key={person.publicId} value={person.publicId}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={`New task status for ${meeting.publicId}`}>
                  <select
                    value={getMeetingTaskForm(meeting.publicId).status}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        status: event.target.value as TaskDto["status"],
                      })
                    }
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Blocked">Blocked</option>
                    <option value="Done">Done</option>
                  </select>
                </FormField>
                <FormField label={`New task due date for ${meeting.publicId}`}>
                  <input
                    type="date"
                    value={getMeetingTaskForm(meeting.publicId).dueDate}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        dueDate: event.target.value,
                      })
                    }
                  />
                </FormField>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={getMeetingTaskForm(meeting.publicId).private}
                    onChange={(event) =>
                      updateMeetingTaskForm(meeting.publicId, {
                        private: event.target.checked,
                      })
                    }
                  />
                  <span>Private</span>
                </label>
                <button className="primary-button" type="submit">
                  Add task to {meeting.publicId}
                </button>
              </form>
              ) : null}
              <AuditLog events={meetingAudits[meeting.publicId] ?? []} />
            </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
