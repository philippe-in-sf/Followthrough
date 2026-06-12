import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AuditLogDto,
  MeetingDto,
  MeetingSeriesDto,
  MeetingType,
  PersonDto,
  TaskDto,
} from "../../../shared/types";
import { api } from "../../api/client";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { LinkedText } from "../../components/LinkedText";
import { StatusBadge } from "../../components/StatusBadge";
import { scrollRecordIntoView } from "../../recordFocus";

type MeetingFormState = {
  publicId: string;
  title: string;
  startsAt: string;
  meetingType: MeetingType;
  seriesPublicId: string;
  summary: string;
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
  attendeePublicIds: string[];
  attendeeNames: string;
  private: boolean;
};

type MeetingTaskFormState = {
  description: string;
  assigneePublicId: string;
  status: TaskDto["status"];
  dueDate: string;
  private: boolean;
};

type MeetingLane = {
  key: string;
  title: string;
  ariaLabel: string;
  tone: "info" | "neutral";
  meetings: MeetingDto[];
};

const emptyMeetingForm: MeetingFormState = {
  publicId: "",
  title: "",
  startsAt: "",
  meetingType: "single",
  seriesPublicId: "",
  summary: "",
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
  attendeePublicIds: [],
  attendeeNames: "",
  private: false,
};

const emptyMeetingTaskForm: MeetingTaskFormState = {
  description: "",
  assigneePublicId: "",
  status: "Open",
  dueDate: "",
  private: false,
};

function toApiDateTime(value: string) {
  return new Date(value).toISOString();
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

function CheckboxGroup({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: Array<{ publicId: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="checkbox-group">
      <legend>{legend}</legend>
      {options.length === 0 ? (
        <span className="muted">None</span>
      ) : (
        options.map((option) => (
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
        ))
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
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [seriesForm, setSeriesForm] = useState<SeriesFormState>(emptySeriesForm);
  const [occurrenceForm, setOccurrenceForm] =
    useState<OccurrenceFormState>(emptyOccurrenceForm);
  const [meetingTaskForms, setMeetingTaskForms] = useState<Record<string, MeetingTaskFormState>>({});
  const [editingMeetingPublicId, setEditingMeetingPublicId] = useState<string | null>(null);
  const [meetingEditForm, setMeetingEditForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [meetingAudits, setMeetingAudits] = useState<Record<string, AuditLogDto[]>>({});
  const meetingLoadRequestId = useRef(0);

  const meetingLanes = useMemo<MeetingLane[]>(() => {
    const now = Date.now();
    const upcoming = meetings
      .filter((meeting) => new Date(meeting.startsAt).getTime() >= now)
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
    const past = meetings
      .filter((meeting) => new Date(meeting.startsAt).getTime() < now)
      .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());

    const lanes: MeetingLane[] = [
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
  }, [meetings]);

  async function load() {
    const requestId = meetingLoadRequestId.current + 1;
    meetingLoadRequestId.current = requestId;
    const [meetingResult, seriesResult, peopleResult, taskResult] = await Promise.all([
      api.meetings.list(),
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
  }, []);

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
      attendeePublicIds,
      taskPublicIds: meetingForm.taskPublicIds,
      private: meetingForm.private,
    };

    await api.meetings.create(body);
    setMeetingForm(emptyMeetingForm);
    await load();
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
      attendeePublicIds,
      private: occurrenceForm.private,
    });
    setOccurrenceForm(emptyOccurrenceForm);
    await load();
  }

  function editMeeting(meeting: MeetingDto) {
    setEditingMeetingPublicId(meeting.publicId);
    setMeetingEditForm({
      publicId: meeting.publicId,
      title: meeting.title,
      startsAt: toDateTimeInputValue(meeting.startsAt),
      meetingType: meeting.meetingType,
      seriesPublicId: meeting.seriesPublicId ?? "",
      summary: meeting.summary,
      attendeePublicIds: meeting.attendees.map((attendee) => attendee.publicId),
      attendeeNames: "",
      taskPublicIds: meeting.tasks.map((task) => task.publicId),
      private: meeting.private,
    });
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
      attendeePublicIds,
      taskPublicIds: meetingEditForm.taskPublicIds,
      private: meetingEditForm.private,
    });
    setEditingMeetingPublicId(null);
    setMeetingEditForm(emptyMeetingForm);
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

  return (
    <main className="page">
      <header className="page-header">
        <h2>Meetings</h2>
      </header>
      <div className="form-grid">
        <form className="editor-form" onSubmit={submitSeries}>
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
        <form className="editor-form" onSubmit={submitOccurrence}>
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
                  {item.title}
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
          <CheckboxGroup
            legend="Existing occurrence attendees"
            options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
            selected={occurrenceForm.attendeePublicIds}
            onChange={(attendeePublicIds) =>
              setOccurrenceForm({ ...occurrenceForm, attendeePublicIds })
            }
          />
          <FormField label="Occurrence attendee names">
            <textarea
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
        <h3>Add meeting</h3>
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
                {item.title}
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
        <CheckboxGroup
          legend="Existing attendees"
          options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
          selected={meetingForm.attendeePublicIds}
          onChange={(attendeePublicIds) =>
            setMeetingForm({ ...meetingForm, attendeePublicIds })
          }
        />
        <FormField label="New attendee names">
          <textarea
            value={meetingForm.attendeeNames}
            onChange={(event) => setMeetingForm({ ...meetingForm, attendeeNames: event.target.value })}
            placeholder="Morgan, Taylor"
          />
        </FormField>
        <CheckboxGroup
          legend="Meeting tasks"
          options={tasks.map((task) => ({
            publicId: task.publicId,
            label: `${task.publicId} ${task.description}`,
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
      {meetings.length === 0 ? (
        <EmptyState title="No meetings" detail="Create a single meeting or start a recurring series." />
      ) : (
        <div className="lane-stack">
          {series.length > 0 ? (
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
                      <strong>{item.title}</strong>
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
                  <strong>{meeting.title}</strong>
                  <span>{meeting.publicId}</span>
                </div>
                <StatusBadge label={meeting.meetingType} />
                {meeting.private ? <StatusBadge label="Private" tone="warn" /> : null}
                <span>{new Date(meeting.startsAt).toLocaleString()}</span>
                <span>{meeting.summary || "No summary"}</span>
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
                          {item.title}
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
                    <textarea
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
                      label: `${task.publicId} ${task.description}`,
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
                  </div>
                </form>
              ) : null}
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
              <AuditLog events={meetingAudits[meeting.publicId] ?? []} />
            </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
