import { type FormEvent, useEffect, useRef, useState } from "react";
import type {
  MeetingDto,
  MeetingSeriesDto,
  MeetingType,
  PersonDto,
  TaskDto,
} from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { StatusBadge } from "../../components/StatusBadge";

type MeetingFormState = {
  publicId: string;
  title: string;
  startsAt: string;
  meetingType: MeetingType;
  seriesPublicId: string;
  summary: string;
  attendeePublicIds: string[];
  taskPublicIds: string[];
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
};

type MeetingTaskFormState = {
  description: string;
  assigneePublicId: string;
  status: TaskDto["status"];
  dueDate: string;
};

const emptyMeetingForm: MeetingFormState = {
  publicId: "",
  title: "",
  startsAt: "",
  meetingType: "single",
  seriesPublicId: "",
  summary: "",
  attendeePublicIds: [],
  taskPublicIds: [],
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
};

const emptyMeetingTaskForm: MeetingTaskFormState = {
  description: "",
  assigneePublicId: "",
  status: "Open",
  dueDate: "",
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

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingDto[]>([]);
  const [series, setSeries] = useState<MeetingSeriesDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(emptyMeetingForm);
  const [seriesForm, setSeriesForm] = useState<SeriesFormState>(emptySeriesForm);
  const [occurrenceForm, setOccurrenceForm] =
    useState<OccurrenceFormState>(emptyOccurrenceForm);
  const [meetingTaskForms, setMeetingTaskForms] = useState<Record<string, MeetingTaskFormState>>({});
  const meetingEditorRef = useRef<HTMLFormElement | null>(null);

  async function load() {
    const [meetingResult, seriesResult, peopleResult, taskResult] = await Promise.all([
      api.meetings.list(),
      api.series.list(),
      api.people.list(),
      api.tasks.list(),
    ]);
    setMeetings(meetingResult.meetings);
    setSeries(seriesResult.series);
    setPeople(peopleResult.people);
    setTasks(taskResult.tasks);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.series.create(seriesForm);
    setSeriesForm(emptySeriesForm);
    await load();
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      title: meetingForm.title,
      startsAt: toApiDateTime(meetingForm.startsAt),
      meetingType: meetingForm.meetingType,
      seriesPublicId:
        meetingForm.meetingType === "recurring" ? meetingForm.seriesPublicId || null : null,
      summary: meetingForm.summary,
      attendeePublicIds: meetingForm.attendeePublicIds,
      taskPublicIds: meetingForm.taskPublicIds,
    };

    if (meetingForm.publicId) await api.meetings.update(meetingForm.publicId, body);
    else await api.meetings.create(body);

    setMeetingForm(emptyMeetingForm);
    await load();
  }

  async function submitOccurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.series.createOccurrence(occurrenceForm.seriesPublicId, {
      title: occurrenceForm.title,
      startsAt: toApiDateTime(occurrenceForm.startsAt),
      summary: occurrenceForm.summary,
      attendeePublicIds: occurrenceForm.attendeePublicIds,
    });
    setOccurrenceForm(emptyOccurrenceForm);
    await load();
  }

  function editMeeting(meeting: MeetingDto) {
    setMeetingForm({
      publicId: meeting.publicId,
      title: meeting.title,
      startsAt: toDateTimeInputValue(meeting.startsAt),
      meetingType: meeting.meetingType,
      seriesPublicId: meeting.seriesPublicId ?? "",
      summary: meeting.summary,
      attendeePublicIds: meeting.attendees.map((attendee) => attendee.publicId),
      taskPublicIds: meeting.tasks.map((task) => task.publicId),
    });
    requestAnimationFrame(() => {
      const editor = meetingEditorRef.current;
      if (typeof editor?.scrollIntoView === "function") {
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      editor?.querySelector("input")?.focus();
    });
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
            legend="Occurrence attendees"
            options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
            selected={occurrenceForm.attendeePublicIds}
            onChange={(attendeePublicIds) =>
              setOccurrenceForm({ ...occurrenceForm, attendeePublicIds })
            }
          />
          <button className="primary-button" type="submit">
            Create occurrence
          </button>
        </form>
      </div>
      <form
        className="editor-form"
        id="meeting-editor"
        onSubmit={submitMeeting}
        ref={meetingEditorRef}
      >
        <h3>{meetingForm.publicId ? `Edit meeting ${meetingForm.publicId}` : "Add meeting"}</h3>
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
          legend="Attendees"
          options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
          selected={meetingForm.attendeePublicIds}
          onChange={(attendeePublicIds) =>
            setMeetingForm({ ...meetingForm, attendeePublicIds })
          }
        />
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
          <button className="primary-button" type="submit">
            {meetingForm.publicId ? "Update meeting" : "Add meeting"}
          </button>
          {meetingForm.publicId ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setMeetingForm(emptyMeetingForm)}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      {meetings.length === 0 ? (
        <EmptyState title="No meetings" detail="Create a single meeting or start a recurring series." />
      ) : (
        <div className="record-list">
          {meetings.map((meeting) => (
            <article
              aria-label={`Meeting ${meeting.publicId}`}
              className="meeting-card"
              key={meeting.publicId}
            >
              <div className="record-row meeting-row">
                <div>
                  <strong>{meeting.title}</strong>
                  <span>{meeting.publicId}</span>
                </div>
                <StatusBadge label={meeting.meetingType} />
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
                        <strong>{task.publicId}</strong> {task.description}
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
                <button className="primary-button" type="submit">
                  Add task to {meeting.publicId}
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
