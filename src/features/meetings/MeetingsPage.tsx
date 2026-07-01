import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  CalendarPlus,
  ChevronDown,
  LinkIcon,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import type {
  AuditLogDto,
  GoogleCalendarImportEventDto,
  MeetingDto,
  MeetingLinkDto,
  MeetingLinkType,
  MeetingSeriesDto,
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
import { toApiDateTime, toDateTimeInputValue } from "./dateTime";

type MeetingFormState = {
  publicId: string;
  title: string;
  startsAt: string;
  recurrenceMode: RecurrenceMode;
  existingSeriesPublicId: string;
  newSeriesTitle: string;
  newSeriesCadenceLabel: string;
  summary: string;
  blockers: string;
  blockersCleared: boolean;
  attendeePublicIds: string[];
  attendeeNames: string;
  taskPublicIds: string[];
  private: boolean;
};

type RecurrenceMode = "single" | "existing" | "new";

type MeetingWizardStep = "basics" | "people" | "details";

type QuickMeetingFormState = {
  title: string;
  startsAt: string;
  attendeeNames: string;
};

type MeetingCreateOptions = {
  calendarDetails?: CalendarImportDetails | null;
  forceSingle?: boolean;
  includeDetails?: boolean;
  includeTasks?: boolean;
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
  recurrenceMode: "single",
  existingSeriesPublicId: "",
  newSeriesTitle: "",
  newSeriesCadenceLabel: "",
  summary: "",
  blockers: "",
  blockersCleared: false,
  attendeePublicIds: [],
  attendeeNames: "",
  taskPublicIds: [],
  private: false,
};

const emptyQuickMeetingForm: QuickMeetingFormState = {
  title: "",
  startsAt: "",
  attendeeNames: "",
};

const meetingWizardSteps: Array<{ key: MeetingWizardStep; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "people", label: "People & Work" },
  { key: "details", label: "Details" },
];

function meetingWizardStepNumber(step: MeetingWizardStep) {
  return meetingWizardSteps.findIndex((item) => item.key === step) + 1;
}

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
  workCalendarUrl,
  onWorkCalendarUrlChange,
  googleCalendarConfigured = false,
  googleCalendarConnected = false,
  googleCalendarEmail = null,
  onGoogleCalendarConnectionChange,
}: {
  focusMeetingPublicId?: string | null;
  onMeetingFocusHandled?: () => void;
  workCalendarUrl?: string | null;
  onWorkCalendarUrlChange?: (workCalendarUrl: string | null) => void;
  googleCalendarConfigured?: boolean;
  googleCalendarConnected?: boolean;
  googleCalendarEmail?: string | null;
  onGoogleCalendarConnectionChange?: (connected: boolean, email: string | null) => void;
}) {
  const [meetings, setMeetings] = useState<MeetingDto[]>([]);
  const [series, setSeries] = useState<MeetingSeriesDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [meetingArchiveView, setMeetingArchiveView] = useState<MeetingArchiveView>("active");
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [quickMeetingForm, setQuickMeetingForm] =
    useState<QuickMeetingFormState>(emptyQuickMeetingForm);
  const [quickMeetingError, setQuickMeetingError] = useState("");
  const [meetingFormError, setMeetingFormError] = useState("");
  const [meetingWizardStep, setMeetingWizardStep] = useState<MeetingWizardStep>("basics");
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);
  const [calendarImportQuery, setCalendarImportQuery] = useState("");
  const [calendarImportEvents, setCalendarImportEvents] = useState<GoogleCalendarImportEventDto[]>(
    [],
  );
  const [calendarImportError, setCalendarImportError] = useState("");
  const [calendarImportLoading, setCalendarImportLoading] = useState(false);
  const [calendarImportDetails, setCalendarImportDetails] =
    useState<CalendarImportDetails | null>(null);
  const [workCalendarInput, setWorkCalendarInput] = useState(workCalendarUrl ?? "");
  const [workCalendarSaving, setWorkCalendarSaving] = useState(false);
  const [workCalendarError, setWorkCalendarError] = useState("");
  const [workCalendarStatus, setWorkCalendarStatus] = useState("");
  const [googleCalendarDisconnecting, setGoogleCalendarDisconnecting] = useState(false);
  const [googleCalendarError, setGoogleCalendarError] = useState("");
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState("");
  const [meetingTaskForms, setMeetingTaskForms] = useState<Record<string, MeetingTaskFormState>>({});
  const [editingMeetingPublicId, setEditingMeetingPublicId] = useState<string | null>(null);
  const [meetingEditForm, setMeetingEditForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [expandedMeetingPublicIds, setExpandedMeetingPublicIds] = useState<Record<string, boolean>>(
    {},
  );
  const [meetingAudits, setMeetingAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [activeNotesMeetingPublicId, setActiveNotesMeetingPublicId] = useState<string | null>(null);
  const [activeSeriesNotesPublicId, setActiveSeriesNotesPublicId] = useState<string | null>(null);
  const [blockersDraft, setBlockersDraft] = useState("");
  const [blockersClearedDraft, setBlockersClearedDraft] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState("");
  const [notesSaveStatus, setNotesSaveStatus] = useState("");
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

  const activeSeriesNotes = useMemo(() => {
    if (!activeSeriesNotesPublicId) return null;
    const selectedSeries =
      series.find((item) => item.publicId === activeSeriesNotesPublicId) ?? null;
    if (!selectedSeries) return null;

    const seriesMeetings = meetings
      .filter((meeting) => meeting.seriesPublicId === activeSeriesNotesPublicId)
      .sort(
        (left, right) =>
          new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      );

    return {
      series: selectedSeries,
      meetings: seriesMeetings,
      noteCount: seriesMeetings.filter((meeting) => meeting.notes.trim()).length,
    };
  }, [activeSeriesNotesPublicId, meetings, series]);

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

  useEffect(() => {
    setWorkCalendarInput(workCalendarUrl ?? "");
  }, [workCalendarUrl]);

  async function saveWorkCalendar(nextWorkCalendarUrl: string | null) {
    setWorkCalendarSaving(true);
    setWorkCalendarError("");
    setWorkCalendarStatus("");
    try {
      const preferences = await api.preferences.update({
        workCalendarUrl: nextWorkCalendarUrl,
      });
      setWorkCalendarInput(preferences.workCalendarUrl ?? "");
      onWorkCalendarUrlChange?.(preferences.workCalendarUrl);
      setWorkCalendarStatus(
        preferences.workCalendarUrl
          ? "Calendar shortcut saved."
          : "Calendar shortcut cleared.",
      );
    } catch (error) {
      setWorkCalendarError(
        error instanceof Error ? error.message : "Calendar shortcut could not be saved.",
      );
    } finally {
      setWorkCalendarSaving(false);
    }
  }

  async function submitWorkCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveWorkCalendar(workCalendarInput);
  }

  async function clearWorkCalendar() {
    setWorkCalendarInput("");
    await saveWorkCalendar(null);
  }

  async function disconnectGoogleCalendar() {
    setGoogleCalendarDisconnecting(true);
    setGoogleCalendarError("");
    setGoogleCalendarStatus("");
    try {
      await api.googleCalendar.disconnect();
      onGoogleCalendarConnectionChange?.(false, null);
      setGoogleCalendarStatus("Google Calendar disconnected.");
    } catch (error) {
      setGoogleCalendarError(
        error instanceof Error ? error.message : "Google Calendar could not be disconnected.",
      );
    } finally {
      setGoogleCalendarDisconnecting(false);
    }
  }

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

  function selectedAttendeeCount(form: MeetingFormState) {
    return form.attendeePublicIds.length + parseAttendeeNames(form.attendeeNames).length;
  }

  function wizardStepSummary(step: MeetingWizardStep) {
    if (step === "basics") {
      return meetingForm.recurrenceMode === "single"
        ? "One-time"
        : meetingForm.recurrenceMode === "existing"
          ? "Existing recurring"
          : "New recurring";
    }
    if (step === "people") {
      return `${countLabel(selectedAttendeeCount(meetingForm), "attendee")}, ${countLabel(
        meetingForm.taskPublicIds.length,
        "task",
      )}`;
    }
    return meetingForm.private ? "Private details" : "Optional details";
  }

  function validateMeetingBasics() {
    if (!meetingForm.title.trim()) return "Enter a meeting title before continuing.";
    if (!meetingForm.startsAt.trim()) return "Enter a meeting start before continuing.";
    if (meetingForm.recurrenceMode === "existing" && !meetingForm.existingSeriesPublicId) {
      return "Choose a recurring meeting before continuing.";
    }
    if (meetingForm.recurrenceMode === "new" && !meetingForm.newSeriesTitle.trim()) {
      return "Enter a recurring meeting name before continuing.";
    }
    return "";
  }

  function goToMeetingWizardStep(step: MeetingWizardStep) {
    if (step !== "basics") {
      const basicsError = validateMeetingBasics();
      if (basicsError) {
        setMeetingFormError(basicsError);
        setMeetingWizardStep("basics");
        return;
      }
    }
    setMeetingFormError("");
    setMeetingWizardStep(step);
  }

  function goToNextMeetingWizardStep() {
    if (meetingWizardStep === "basics") {
      goToMeetingWizardStep("people");
      return;
    }
    if (meetingWizardStep === "people") {
      goToMeetingWizardStep("details");
    }
  }

  function goToPreviousMeetingWizardStep() {
    setMeetingFormError("");
    if (meetingWizardStep === "details") setMeetingWizardStep("people");
    if (meetingWizardStep === "people") setMeetingWizardStep("basics");
  }

  async function createMeetingFromForm(
    form: MeetingFormState,
    {
      calendarDetails = null,
      forceSingle = false,
      includeDetails = true,
      includeTasks = true,
    }: MeetingCreateOptions = {},
  ) {
    const attendeePublicIds = await resolveAttendeePublicIds(
      form.attendeePublicIds,
      form.attendeeNames,
    );
    const sharedMeetingFields = {
      title: form.title,
      startsAt: toApiDateTime(form.startsAt),
      summary: includeDetails ? form.summary : "",
      blockers: includeDetails ? form.blockers : "",
      blockersCleared: includeDetails ? form.blockersCleared : false,
      notes: includeDetails ? calendarDetails?.notes ?? "" : "",
      links: includeDetails ? calendarDetails?.links ?? [] : [],
      attendeePublicIds,
      taskPublicIds: includeTasks ? form.taskPublicIds : [],
      private: includeDetails ? form.private : false,
    };

    if (!forceSingle && form.recurrenceMode === "existing") {
      await api.series.createOccurrence(form.existingSeriesPublicId, sharedMeetingFields);
      return;
    }

    const seriesPublicId =
      !forceSingle && form.recurrenceMode === "new"
        ? (
            await api.series.create({
              title: form.newSeriesTitle,
              cadenceLabel: form.newSeriesCadenceLabel,
              active: true,
            })
          ).series.publicId
        : null;

    await api.meetings.create({
      ...sharedMeetingFields,
      meetingType: seriesPublicId ? "recurring" : "single",
      seriesPublicId,
    });
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMeetingFormError("");
    const basicsError = validateMeetingBasics();
    if (basicsError) {
      setMeetingFormError(basicsError);
      setMeetingWizardStep("basics");
      return;
    }
    if (meetingWizardStep !== "details") {
      goToNextMeetingWizardStep();
      return;
    }
    try {
      await createMeetingFromForm(meetingForm, { calendarDetails: calendarImportDetails });
      setMeetingForm(emptyMeetingForm);
      setCalendarImportDetails(null);
      setMeetingWizardStep("basics");
      await load();
    } catch (error) {
      setMeetingFormError(error instanceof Error ? error.message : "Meeting could not be created.");
    }
  }

  async function submitQuickMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuickMeetingError("");
    try {
      await createMeetingFromForm(
        {
          ...emptyMeetingForm,
          title: quickMeetingForm.title,
          startsAt: quickMeetingForm.startsAt,
          attendeeNames: quickMeetingForm.attendeeNames,
        },
        {
          forceSingle: true,
          includeDetails: false,
          includeTasks: false,
        },
      );
      setQuickMeetingForm(emptyQuickMeetingForm);
      await load();
    } catch (error) {
      setQuickMeetingError(error instanceof Error ? error.message : "Quick Add meeting failed.");
    }
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
      recurrenceMode: "single",
      existingSeriesPublicId: "",
      newSeriesTitle: "",
      newSeriesCadenceLabel: "",
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
    setMeetingWizardStep("basics");
    setMeetingFormError("");
  }

  function editMeeting(meeting: MeetingDto) {
    expandMeeting(meeting.publicId);
    setEditingMeetingPublicId(meeting.publicId);
    setMeetingEditForm({
      publicId: meeting.publicId,
      title: meeting.title,
      startsAt: toDateTimeInputValue(meeting.startsAt),
      recurrenceMode: meeting.meetingType === "recurring" ? "existing" : "single",
      existingSeriesPublicId: meeting.seriesPublicId ?? "",
      newSeriesTitle: "",
      newSeriesCadenceLabel: "",
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
      meetingType: meetingEditForm.recurrenceMode === "existing" ? "recurring" : "single",
      seriesPublicId:
        meetingEditForm.recurrenceMode === "existing"
          ? meetingEditForm.existingSeriesPublicId || null
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
    setActiveSeriesNotesPublicId(null);
    setEditingMeetingPublicId(null);
    setBlockersDraft(meeting.blockers);
    setBlockersClearedDraft(meeting.blockersClearedAt !== null);
    setNotesDraft(meeting.notes);
    setNotesSaving(false);
    setNotesSaveError("");
    setNotesSaveStatus("");
    setLinkDrafts(meeting.links.map(toMeetingLinkForm));
    setNewLinkForm(emptyMeetingLinkForm);
  }

  function openSeriesNotes(seriesPublicId: string) {
    setActiveSeriesNotesPublicId(seriesPublicId);
    setActiveNotesMeetingPublicId(null);
    setEditingMeetingPublicId(null);
  }

  function closeSeriesNotes() {
    setActiveSeriesNotesPublicId(null);
  }

  function closeMeetingNotes() {
    setActiveNotesMeetingPublicId(null);
    setBlockersDraft("");
    setBlockersClearedDraft(false);
    setNotesDraft("");
    setNotesSaving(false);
    setNotesSaveError("");
    setNotesSaveStatus("");
    setLinkDrafts([]);
    setNewLinkForm(emptyMeetingLinkForm);
  }

  function updateLinkDraft(index: number, changes: Partial<MeetingLinkFormState>) {
    setNotesSaveStatus("");
    setLinkDrafts((current) =>
      current.map((link, currentIndex) =>
        currentIndex === index ? { ...link, ...changes } : link,
      ),
    );
  }

  function removeLinkDraft(index: number) {
    setNotesSaveStatus("");
    setLinkDrafts((current) => current.filter((_link, currentIndex) => currentIndex !== index));
  }

  function addLinkDraft() {
    setNotesSaveStatus("");
    setLinkDrafts((current) => [...current, newLinkForm]);
    setNewLinkForm(emptyMeetingLinkForm);
  }

  async function submitMeetingNotes(event: FormEvent<HTMLFormElement>, meeting: MeetingDto) {
    event.preventDefault();
    setNotesSaving(true);
    setNotesSaveError("");
    setNotesSaveStatus("");
    const pendingLink =
      newLinkForm.label.trim() && newLinkForm.url.trim() ? [newLinkForm] : [];
    const links = [...linkDrafts, ...pendingLink];
    try {
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
      setNotesSaveStatus("Notes saved.");
      await load();
    } catch (error) {
      setNotesSaveError(error instanceof Error ? error.message : "Notes could not be saved.");
    } finally {
      setNotesSaving(false);
    }
  }

  if (activeSeriesNotes) {
    return (
      <main className="page series-notes-page">
        <header className="page-header meeting-notes-header">
          <div className="meeting-notes-titlebar">
            <button
              className="secondary-button icon-text-button"
              type="button"
              onClick={closeSeriesNotes}
            >
              <ArrowLeft aria-hidden="true" size={17} />
              Back
            </button>
            <div>
              <h2>{activeSeriesNotes.series.title}</h2>
              <p>
                {activeSeriesNotes.series.publicId} ·{" "}
                {activeSeriesNotes.series.cadenceLabel || "Recurring"}
              </p>
            </div>
          </div>
          <div className="meeting-notes-meta">
            <span className="lane-count">
              {countLabel(activeSeriesNotes.meetings.length, "meeting")}
            </span>
            <span className="lane-count">
              {countLabel(activeSeriesNotes.noteCount, "note")}
            </span>
          </div>
        </header>

        {activeSeriesNotes.meetings.length === 0 ? (
          <EmptyState
            title="No meetings in this series"
            detail="Series notes will appear after recurring meetings are created."
          />
        ) : (
          <section
            aria-label={`Notes for ${activeSeriesNotes.series.title}`}
            className="series-notes-list"
          >
            {activeSeriesNotes.meetings.map((meeting) => {
              const notes = meeting.notes.trim();
              return (
                <article
                  aria-label={`Notes for meeting ${meeting.publicId}`}
                  className="series-note-card"
                  key={meeting.publicId}
                >
                  <header className="series-note-header">
                    <div>
                      <h3>{meeting.title}</h3>
                      <span>
                        {meeting.publicId} · {new Date(meeting.startsAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="series-note-badges">
                      <StatusBadge label={meeting.meetingType} />
                      {meeting.private ? <StatusBadge label="Private" tone="warn" /> : null}
                      {hasActiveBlockers(meeting) ? (
                        <StatusBadge label="Blocker" tone="bad" />
                      ) : null}
                      {hasClearedBlockers(meeting) ? (
                        <StatusBadge label="Blocker cleared" tone="good" />
                      ) : null}
                    </div>
                  </header>
                  <div className={notes ? "series-note-body" : "series-note-body muted"}>
                    {notes ? (
                      <LinkedText text={notes} />
                    ) : (
                      "No notes captured for this occurrence."
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    );
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
            disabled={notesSaving}
            type="submit"
            form={`meeting-notes-form-${activeNotesMeeting.publicId}`}
          >
            <Save aria-hidden="true" size={17} />
            {notesSaving ? "Saving notes" : "Save notes"}
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
                  setNotesSaveStatus("");
                  if (!event.target.value.trim()) setBlockersClearedDraft(false);
                }}
              />
            </FormField>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={blockersClearedDraft}
                disabled={!blockersDraft.trim()}
                onChange={(event) => {
                  setBlockersClearedDraft(event.target.checked);
                  setNotesSaveStatus("");
                }}
              />
              <span>Blocker cleared</span>
            </label>
            {notesSaveError ? (
              <p className="form-error" role="alert">
                {notesSaveError}
              </p>
            ) : null}
            {notesSaveStatus ? (
              <p className="form-status" role="status">
                {notesSaveStatus}
              </p>
            ) : null}
            <FormField label={`Notes for ${activeNotesMeeting.publicId}`}>
              <textarea
                autoFocus
                className="meeting-notes-textarea"
                value={notesDraft}
                onChange={(event) => {
                  setNotesDraft(event.target.value);
                  setNotesSaveStatus("");
                }}
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
                    onChange={(event) => {
                      setNewLinkForm({ ...newLinkForm, label: event.target.value });
                      setNotesSaveStatus("");
                    }}
                  />
                </FormField>
                <FormField label="New link URL">
                  <input
                    type="url"
                    value={newLinkForm.url}
                    onChange={(event) => {
                      setNewLinkForm({ ...newLinkForm, url: event.target.value });
                      setNotesSaveStatus("");
                    }}
                  />
                </FormField>
                <FormField label="New link type">
                  <select
                    value={newLinkForm.linkType}
                    onChange={(event) => {
                      setNewLinkForm({
                        ...newLinkForm,
                        linkType: event.target.value as MeetingLinkType,
                      });
                      setNotesSaveStatus("");
                    }}
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
      <form
        className="calendar-settings-panel"
        aria-label="Calendar settings"
        onSubmit={submitWorkCalendar}
      >
        <h3>Calendar settings</h3>
        <section className="google-calendar-connection" aria-label="Google Calendar connection">
          <div>
            <strong>Google Calendar</strong>
            <span>
              {googleCalendarConnected
                ? `Connected as ${googleCalendarEmail ?? "Google Calendar"}`
                : googleCalendarConfigured
                  ? "Google Calendar is not connected."
                  : "Google Calendar connection is not available."}
            </span>
          </div>
          {googleCalendarConnected ? (
            <button
              className="secondary-button icon-text-button"
              type="button"
              onClick={disconnectGoogleCalendar}
              disabled={googleCalendarDisconnecting}
            >
              <Trash2 aria-hidden="true" size={17} />
              {googleCalendarDisconnecting ? "Disconnecting" : "Disconnect Google Calendar"}
            </button>
          ) : googleCalendarConfigured ? (
            <a className="primary-button icon-text-button" href="/api/google-calendar/connect">
              <CalendarPlus aria-hidden="true" size={17} />
              Connect Google Calendar
            </a>
          ) : null}
        </section>
        {googleCalendarError ? (
          <p className="form-error" role="alert">
            {googleCalendarError}
          </p>
        ) : null}
        {googleCalendarStatus ? (
          <p className="form-status" role="status">
            {googleCalendarStatus}
          </p>
        ) : null}
        <FormField label="Calendar shortcut URL">
          <input
            type="url"
            value={workCalendarInput}
            onChange={(event) => setWorkCalendarInput(event.target.value)}
            placeholder="https://calendar.example.com/team"
          />
        </FormField>
        <div className="calendar-settings-actions">
          <button
            className="primary-button icon-text-button"
            type="submit"
            disabled={workCalendarSaving}
          >
            <Save aria-hidden="true" size={17} />
            {workCalendarSaving ? "Saving" : "Save shortcut"}
          </button>
          <button
            className="secondary-button icon-text-button"
            type="button"
            onClick={clearWorkCalendar}
            disabled={workCalendarSaving || !workCalendarInput.trim()}
          >
            <Trash2 aria-hidden="true" size={17} />
            Clear shortcut
          </button>
        </div>
        {workCalendarError ? (
          <p className="form-error" role="alert">
            {workCalendarError}
          </p>
        ) : null}
        {workCalendarStatus ? (
          <p className="form-status" role="status">
            {workCalendarStatus}
          </p>
        ) : null}
      </form>
      <form
        className="quick-meeting-form"
        aria-label="Quick add one-time meeting"
        onSubmit={submitQuickMeeting}
      >
        <div className="quick-meeting-heading">
          <h3>Quick add one-time meeting</h3>
          <span>Title, time, attendees</span>
        </div>
        <FormField label="Quick add meeting title">
          <input
            value={quickMeetingForm.title}
            onChange={(event) =>
              setQuickMeetingForm({ ...quickMeetingForm, title: event.target.value })
            }
            required
          />
        </FormField>
        <FormField label="Quick add meeting start">
          <input
            type="datetime-local"
            value={quickMeetingForm.startsAt}
            onChange={(event) =>
              setQuickMeetingForm({ ...quickMeetingForm, startsAt: event.target.value })
            }
            required
          />
        </FormField>
        <FormField label="Quick add attendees">
          <input
            value={quickMeetingForm.attendeeNames}
            onChange={(event) =>
              setQuickMeetingForm({ ...quickMeetingForm, attendeeNames: event.target.value })
            }
            placeholder="Morgan Lee, Taylor Park"
          />
        </FormField>
        <button className="primary-button" type="submit">
          Quick add meeting
        </button>
        {quickMeetingError ? (
          <p className="form-error" role="alert">
            {quickMeetingError}
          </p>
        ) : null}
      </form>
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
        <div className="meeting-wizard-stepper" role="group" aria-label="Add meeting steps">
          {meetingWizardSteps.map((step, index) => (
            <button
              aria-current={meetingWizardStep === step.key ? "step" : undefined}
              aria-label={`${index + 1} ${step.label} ${wizardStepSummary(step.key)}`}
              className={meetingWizardStep === step.key ? "active" : ""}
              key={step.key}
              type="button"
              onClick={() => goToMeetingWizardStep(step.key)}
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
              <small>{wizardStepSummary(step.key)}</small>
            </button>
          ))}
        </div>
        <div className="meeting-wizard-progress">
          Step {meetingWizardStepNumber(meetingWizardStep)} of {meetingWizardSteps.length}
        </div>

        {meetingWizardStep === "basics" ? (
          <section className="meeting-wizard-panel" aria-label="Meeting basics">
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
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, startsAt: event.target.value })
                }
                required
              />
            </FormField>
            <FormField label="Recurrence">
              <select
                value={meetingForm.recurrenceMode}
                onChange={(event) =>
                  setMeetingForm({
                    ...meetingForm,
                    recurrenceMode: event.target.value as RecurrenceMode,
                    existingSeriesPublicId:
                      event.target.value === "existing" ? meetingForm.existingSeriesPublicId : "",
                    newSeriesTitle:
                      event.target.value === "new" ? meetingForm.newSeriesTitle : "",
                    newSeriesCadenceLabel:
                      event.target.value === "new" ? meetingForm.newSeriesCadenceLabel : "",
                  })
                }
              >
                <option value="single">One-time meeting</option>
                <option value="existing">Use existing recurring meeting</option>
                <option value="new">Start new recurring meeting</option>
              </select>
            </FormField>
            {meetingForm.recurrenceMode === "existing" ? (
              <FormField label="Existing recurring meeting">
                <select
                  value={meetingForm.existingSeriesPublicId}
                  onChange={(event) =>
                    setMeetingForm({ ...meetingForm, existingSeriesPublicId: event.target.value })
                  }
                  required
                >
                  <option value="">Choose recurring meeting</option>
                  {series.map((item) => (
                    <option key={item.publicId} value={item.publicId}>
                      {collapseLinks(item.title)}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {meetingForm.recurrenceMode === "new" ? (
              <>
                <FormField label="New recurring meeting name">
                  <input
                    value={meetingForm.newSeriesTitle}
                    onChange={(event) =>
                      setMeetingForm({ ...meetingForm, newSeriesTitle: event.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Cadence">
                  <input
                    value={meetingForm.newSeriesCadenceLabel}
                    onChange={(event) =>
                      setMeetingForm({
                        ...meetingForm,
                        newSeriesCadenceLabel: event.target.value,
                      })
                    }
                    placeholder="Weekly"
                  />
                </FormField>
              </>
            ) : null}
          </section>
        ) : null}

        {meetingWizardStep === "people" ? (
          <section className="meeting-wizard-panel" aria-label="Meeting people and work">
            <CheckboxGroup
              legend="Existing attendees"
              options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
              selected={meetingForm.attendeePublicIds}
              onChange={(attendeePublicIds) =>
                setMeetingForm({ ...meetingForm, attendeePublicIds })
              }
            />
            <FormField label="Add attendees while building this meeting">
              <input
                value={meetingForm.attendeeNames}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, attendeeNames: event.target.value })
                }
                placeholder="Morgan Lee, Taylor Park"
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
          </section>
        ) : null}

        {meetingWizardStep === "details" ? (
          <section className="meeting-wizard-panel" aria-label="Meeting details">
            <FormField label="Meeting summary">
              <textarea
                value={meetingForm.summary}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, summary: event.target.value })
                }
              />
            </FormField>
            <FormField label="Meeting blockers">
              <textarea
                value={meetingForm.blockers}
                onChange={(event) =>
                  setMeetingForm({
                    ...meetingForm,
                    blockers: event.target.value,
                    blockersCleared: event.target.value.trim()
                      ? meetingForm.blockersCleared
                      : false,
                  })
                }
              />
            </FormField>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={meetingForm.blockersCleared}
                disabled={!meetingForm.blockers.trim()}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, blockersCleared: event.target.checked })
                }
              />
              <span>Blocker cleared</span>
            </label>
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
          </section>
        ) : null}
        {meetingFormError ? (
          <p className="form-error" role="alert">
            {meetingFormError}
          </p>
        ) : null}
        <div className="meeting-wizard-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={goToPreviousMeetingWizardStep}
            disabled={meetingWizardStep === "basics"}
          >
            Back
          </button>
          {meetingWizardStep === "details" ? (
            <button className="primary-button" type="submit">
              Add meeting
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={goToNextMeetingWizardStep}>
              {meetingWizardStep === "basics" ? "Next: People & Work" : "Next: Details"}
            </button>
          )}
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
                    <div className="series-row-main">
                      <strong>
                        <LinkedText text={item.title} />
                      </strong>
                      <span>{item.publicId}</span>
                    </div>
                    <div className="series-row-actions">
                      <span className="hint-chip hint-chip-teal">
                        {item.cadenceLabel || "Recurring"}
                      </span>
                      <button
                        aria-label={`Read notes for series ${item.publicId} ${singleLineText(item.title, "Untitled series")}`}
                        className="secondary-button icon-text-button"
                        type="button"
                        onClick={() => openSeriesNotes(item.publicId)}
                      >
                        <BookOpen aria-hidden="true" size={16} />
                        Notes
                      </button>
                    </div>
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
                {lane.meetings.map((meeting) => {
                  const isExpanded = Boolean(expandedMeetingPublicIds[meeting.publicId]);
                  const detailsId = `meeting-details-${meeting.publicId}`;
                  const meetingTitleText = singleLineText(meeting.title, "Untitled meeting");
                  const meetingSummaryText = singleLineText(meeting.summary, "No summary");

                  return (
                    <article
                      aria-label={`Meeting ${meeting.publicId}`}
                      className="meeting-card record-card-meeting"
                      id={`meeting-${meeting.publicId}`}
                      key={meeting.publicId}
                    >
                      <button
                        aria-controls={detailsId}
                        aria-expanded={isExpanded}
                        aria-label={`${
                          isExpanded ? "Collapse" : "Expand"
                        } meeting ${meeting.publicId} ${meetingTitleText}`}
                        className="meeting-summary-button"
                        type="button"
                        onClick={() => toggleMeeting(meeting.publicId)}
                      >
                        <span className="meeting-summary-title">
                          <ChevronDown
                            aria-hidden="true"
                            className={`meeting-expand-icon ${
                              isExpanded ? "meeting-expand-icon-open" : ""
                            }`}
                            size={17}
                          />
                          <strong>{meetingTitleText}</strong>
                          <span>{meeting.publicId}</span>
                        </span>
                        <span className="meeting-summary-meta">
                          <StatusBadge label={meeting.meetingType} />
                          {meeting.private ? <StatusBadge label="Private" tone="warn" /> : null}
                          {meeting.archived ? <StatusBadge label="Archived" /> : null}
                          {hasActiveBlockers(meeting) ? (
                            <StatusBadge label="Blocker" tone="bad" />
                          ) : null}
                          {hasClearedBlockers(meeting) ? (
                            <StatusBadge label="Blocker cleared" tone="good" />
                          ) : null}
                          <span className="meeting-summary-date">
                            {new Date(meeting.startsAt).toLocaleString()}
                          </span>
                          <span className="meeting-summary-counts">
                            {countLabel(meeting.attendees.length, "attendee")}
                          </span>
                          <span className="meeting-summary-counts">
                            {countLabel(meeting.tasks.length, "task")}
                          </span>
                          <span className="meeting-summary-text">{meetingSummaryText}</span>
                        </span>
                      </button>
                      {isExpanded ? (
                        <div className="meeting-expanded-content" id={detailsId}>
                          <div className="meeting-detail-grid">
                            <section className="meeting-detail-section">
                              <h4>Details</h4>
                              <p>{new Date(meeting.startsAt).toLocaleString()}</p>
                              <p>{meeting.meetingType}</p>
                              <div className="meeting-detail-badges">
                                <StatusBadge label={meeting.meetingType} />
                                {meeting.private ? (
                                  <StatusBadge label="Private" tone="warn" />
                                ) : null}
                                {meeting.archived ? <StatusBadge label="Archived" /> : null}
                              </div>
                            </section>
                            <section className="meeting-detail-section">
                              <h4>Summary</h4>
                              <p>
                                <LinkedText text={meeting.summary || "No summary"} />
                              </p>
                            </section>
                            <section className="meeting-detail-section">
                              <h4>Blockers</h4>
                              {hasBlockers(meeting) ? (
                                <MeetingBlockerNote meeting={meeting} />
                              ) : (
                                <p className="muted meeting-empty-detail">No blockers</p>
                              )}
                            </section>
                            <section className="meeting-detail-section">
                              <h4>Attendees</h4>
                              <p>{attendeeSummary(meeting)}</p>
                            </section>
                            <section className="meeting-detail-section">
                              <h4>Tasks</h4>
                              <MeetingTaskLinks meeting={meeting} />
                            </section>
                            <section className="meeting-detail-section">
                              <h4>Links</h4>
                              <MeetingStructuredLinks meeting={meeting} />
                            </section>
                          </div>
                          <div className="meeting-card-actions">
                            {meeting.archived ? (
                              <button
                                className="secondary-button icon-text-button"
                                type="button"
                                onClick={() => restoreMeeting(meeting)}
                                aria-label={`Restore meeting ${meeting.publicId}`}
                              >
                                <RotateCcw aria-hidden="true" size={16} />
                                Restore meeting
                              </button>
                            ) : (
                              <>
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
                              </>
                            )}
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
                                    setMeetingEditForm({
                                      ...meetingEditForm,
                                      title: event.target.value,
                                    })
                                  }
                                  required
                                />
                              </FormField>
                              <FormField label={`Meeting start for ${meeting.publicId}`}>
                                <input
                                  type="datetime-local"
                                  value={meetingEditForm.startsAt}
                                  onChange={(event) =>
                                    setMeetingEditForm({
                                      ...meetingEditForm,
                                      startsAt: event.target.value,
                                    })
                                  }
                                  required
                                />
                              </FormField>
                              <FormField label={`Meeting type for ${meeting.publicId}`}>
                                <select
                                  value={meetingEditForm.recurrenceMode}
                                  onChange={(event) =>
                                    setMeetingEditForm({
                                      ...meetingEditForm,
                                      recurrenceMode:
                                        event.target.value === "existing"
                                          ? "existing"
                                          : "single",
                                      existingSeriesPublicId:
                                        event.target.value === "existing"
                                          ? meetingEditForm.existingSeriesPublicId
                                          : "",
                                    })
                                  }
                                >
                                  <option value="single">Single</option>
                                  <option value="existing">Recurring</option>
                                </select>
                              </FormField>
                              <FormField label={`Meeting series for ${meeting.publicId}`}>
                                <select
                                  value={meetingEditForm.existingSeriesPublicId}
                                  onChange={(event) =>
                                    setMeetingEditForm({
                                      ...meetingEditForm,
                                      existingSeriesPublicId: event.target.value,
                                    })
                                  }
                                  required={meetingEditForm.recurrenceMode === "existing"}
                                  disabled={meetingEditForm.recurrenceMode === "single"}
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
                                    setMeetingEditForm({
                                      ...meetingEditForm,
                                      summary: event.target.value,
                                    })
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
                            <form
                              className="meeting-task-form"
                              onSubmit={(event) => submitMeetingTask(event, meeting)}
                            >
                              <h3>Add task to {meeting.publicId}</h3>
                              <FormField
                                label={`New task description for ${meeting.publicId}`}
                              >
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
                        </div>
                      ) : null}
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
