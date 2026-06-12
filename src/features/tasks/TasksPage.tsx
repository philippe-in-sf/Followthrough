import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Mail } from "lucide-react";
import type {
  AuditLogDto,
  PersonDto,
  TaskDto,
  TaskReminderMode,
  TaskStatus,
} from "../../../shared/types";
import { ApiError, api } from "../../api/client";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { StatusBadge } from "../../components/StatusBadge";

const statuses: TaskStatus[] = ["Open", "In Progress", "Blocked", "Done"];
const reminderModes: Array<{ value: TaskReminderMode; label: string }> = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual only" },
];

type TaskLane = {
  key: string;
  title: string;
  ariaLabel: string;
  tone: "bad" | "warn" | "info" | "good";
  tasks: TaskDto[];
};

type TaskFormState = {
  description: string;
  assigneePublicId: string;
  status: TaskStatus;
  dueDate: string;
  originMeetingPublicId: string | null;
  seriesPublicId: string | null;
  reminderMode: TaskReminderMode;
};

const emptyTaskForm: TaskFormState = {
  description: "",
  assigneePublicId: "",
  status: "Open",
  dueDate: "",
  originMeetingPublicId: null,
  seriesPublicId: null,
  reminderMode: "automatic",
};

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function taskCardTone(task: TaskDto) {
  if (task.alert === "overdue") return "record-card-bad";
  if (task.alert === "dueSoon") return "record-card-warn";
  if (task.status === "Done") return "record-card-good";
  return "record-card-info";
}

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [assigneePublicId, setAssigneePublicId] = useState("");
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const [editingTaskPublicId, setEditingTaskPublicId] = useState<string | null>(null);
  const [taskEditForm, setTaskEditForm] = useState<TaskFormState>(emptyTaskForm);
  const [taskAudits, setTaskAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [pendingReminderPublicId, setPendingReminderPublicId] = useState<string | null>(null);
  const [reminderFeedback, setReminderFeedback] = useState<Record<string, string>>({});
  const taskLoadRequestId = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (assigneePublicId) params.set("assigneePublicId", assigneePublicId);
    if (status) params.set("status", status);
    if (alert) params.set("alert", alert);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [assigneePublicId, status, alert]);

  const taskLanes = useMemo<TaskLane[]>(() => {
    const overdue = tasks.filter((task) => task.alert === "overdue");
    const dueSoon = tasks.filter((task) => task.alert === "dueSoon");
    const active = tasks.filter((task) => !task.alert && task.status !== "Done");
    const done = tasks.filter((task) => !task.alert && task.status === "Done");

    const lanes: TaskLane[] = [
      {
        key: "overdue",
        title: "Overdue",
        ariaLabel: "Overdue tasks",
        tone: "bad",
        tasks: overdue,
      },
      {
        key: "due-soon",
        title: "Due soon",
        ariaLabel: "Due soon tasks",
        tone: "warn",
        tasks: dueSoon,
      },
      {
        key: "active",
        title: "Active",
        ariaLabel: "Active tasks",
        tone: "info",
        tasks: active,
      },
      {
        key: "done",
        title: "Done",
        ariaLabel: "Done tasks",
        tone: "good",
        tasks: done,
      },
    ];

    return lanes.filter((lane) => lane.tasks.length > 0);
  }, [tasks]);

  async function loadTasks() {
    const requestId = taskLoadRequestId.current + 1;
    taskLoadRequestId.current = requestId;
    const result = await api.tasks.list(query);
    const auditEntries = await Promise.all(
      result.tasks.map(async (task) => {
        const auditResult = await api.tasks
          .audit(task.publicId)
          .catch(() => ({ auditEvents: [] as AuditLogDto[] }));
        return [task.publicId, auditResult.auditEvents ?? []] as const;
      }),
    );
    if (requestId !== taskLoadRequestId.current) return;
    setTasks([...result.tasks]);
    setTaskAudits(Object.fromEntries(auditEntries));
  }

  useEffect(() => {
    void api.people.list().then((result) => setPeople(result.people));
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [query]);

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      description: form.description,
      assigneePublicId: form.assigneePublicId || null,
      status: form.status,
      dueDate: form.dueDate || null,
      originMeetingPublicId: form.originMeetingPublicId,
      seriesPublicId: form.seriesPublicId,
      reminderMode: form.reminderMode,
    };

    await api.tasks.create(body);
    setForm(emptyTaskForm);
    await loadTasks();
  }

  function editTask(task: TaskDto) {
    setEditingTaskPublicId(task.publicId);
    setTaskEditForm({
      description: task.description,
      assigneePublicId: task.assignee?.publicId ?? "",
      status: task.status,
      dueDate: task.dueDate ?? "",
      originMeetingPublicId: task.originMeetingPublicId,
      seriesPublicId: task.seriesPublicId,
      reminderMode: task.reminderMode,
    });
  }

  async function submitTaskEdit(event: FormEvent<HTMLFormElement>, task: TaskDto) {
    event.preventDefault();
    await api.tasks.update(task.publicId, {
      description: taskEditForm.description,
      assigneePublicId: taskEditForm.assigneePublicId || null,
      status: taskEditForm.status,
      dueDate: taskEditForm.dueDate || null,
      originMeetingPublicId: taskEditForm.originMeetingPublicId,
      seriesPublicId: taskEditForm.seriesPublicId,
      reminderMode: taskEditForm.reminderMode,
    });
    setEditingTaskPublicId(null);
    setTaskEditForm(emptyTaskForm);
    await loadTasks();
  }

  async function sendReminder(task: TaskDto) {
    setPendingReminderPublicId(task.publicId);
    setReminderFeedback((current) => ({ ...current, [task.publicId]: "" }));

    try {
      await api.tasks.sendReminder(task.publicId);
      setReminderFeedback((current) => ({ ...current, [task.publicId]: "Reminder sent" }));
      await loadTasks();
    } catch (error) {
      setReminderFeedback((current) => ({
        ...current,
        [task.publicId]:
          error instanceof ApiError ? error.message : "Could not send reminder",
      }));
    } finally {
      setPendingReminderPublicId(null);
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h2>Tasks</h2>
      </header>
      <form className="editor-form" onSubmit={submitTask}>
        <FormField label="Task description">
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Task assignee">
          <select
            value={form.assigneePublicId}
            onChange={(event) => setForm({ ...form, assigneePublicId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {people.map((person) => (
              <option key={person.publicId} value={person.publicId}>
                {person.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Task status">
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Task due date">
          <input
            type="date"
            value={form.dueDate}
            onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
          />
        </FormField>
        <FormField label="Reminder mode">
          <select
            value={form.reminderMode}
            onChange={(event) =>
              setForm({ ...form, reminderMode: event.target.value as TaskReminderMode })
            }
          >
            {reminderModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            Add task
          </button>
        </div>
      </form>
      <div className="filter-bar">
        <select
          aria-label="Filter assignee"
          value={assigneePublicId}
          onChange={(event) => setAssigneePublicId(event.target.value)}
        >
          <option value="">All assignees</option>
          {people.map((person) => (
            <option key={person.publicId} value={person.publicId}>
              {person.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Filter alert"
          value={alert}
          onChange={(event) => setAlert(event.target.value)}
        >
          <option value="">All due dates</option>
          <option value="dueSoon">Due soon</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      {tasks.length === 0 ? (
        <EmptyState title="No tasks" detail="Create tasks from meetings or as standalone work." />
      ) : (
        <div className="lane-stack">
          {taskLanes.map((lane) => (
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
                <span className="lane-count">{countLabel(lane.tasks.length, "task")}</span>
              </header>
              <div className="record-list">
                {lane.tasks.map((task) => (
                  <article
                    aria-label={`Task ${task.publicId}`}
                    className={`task-card ${taskCardTone(task)}`}
                    key={task.publicId}
                  >
                    <div className="record-row task-row">
                      <div>
                        <strong>{task.description}</strong>
                        <span>{task.publicId}</span>
                      </div>
                      <StatusBadge label={task.status} />
                      {task.alert === "dueSoon" ? (
                        <StatusBadge label="Due soon" tone="warn" />
                      ) : null}
                      {task.alert === "overdue" ? (
                        <StatusBadge label="Overdue" tone="bad" />
                      ) : null}
                      <StatusBadge
                        label={task.reminderMode === "automatic" ? "Auto reminders" : "Manual only"}
                      />
                      <span>{task.assignee?.name ?? "Unassigned"}</span>
                      <span>{task.dueDate ?? "No due date"}</span>
                      <button
                        className="secondary-button icon-text-button"
                        type="button"
                        onClick={() => sendReminder(task)}
                        aria-label={`Send reminder for ${task.publicId}`}
                        disabled={
                          task.status === "Done" ||
                          !task.assignee?.email ||
                          pendingReminderPublicId === task.publicId
                        }
                      >
                        <Mail aria-hidden="true" size={16} />
                        {pendingReminderPublicId === task.publicId ? "Sending" : "Send reminder"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => editTask(task)}
                        aria-label={`Edit details for ${task.publicId}`}
                      >
                        Edit details
                      </button>
                    </div>
                    {reminderFeedback[task.publicId] ? (
                      <p className="task-reminder-feedback">{reminderFeedback[task.publicId]}</p>
                    ) : null}
                    {editingTaskPublicId === task.publicId ? (
                      <>
                        <form
                          className="task-edit-form"
                          onSubmit={(event) => submitTaskEdit(event, task)}
                        >
                          <h3>Edit details for {task.publicId}</h3>
                          <FormField label={`Task description for ${task.publicId}`}>
                            <input
                              value={taskEditForm.description}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
                                  description: event.target.value,
                                })
                              }
                              required
                            />
                          </FormField>
                          <FormField label={`Task assignee for ${task.publicId}`}>
                            <select
                              value={taskEditForm.assigneePublicId}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
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
                          <FormField label={`Task status for ${task.publicId}`}>
                            <select
                              value={taskEditForm.status}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
                                  status: event.target.value as TaskStatus,
                                })
                              }
                            >
                              {statuses.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label={`Task due date for ${task.publicId}`}>
                            <input
                              type="date"
                              value={taskEditForm.dueDate}
                              onChange={(event) =>
                                setTaskEditForm({ ...taskEditForm, dueDate: event.target.value })
                              }
                            />
                          </FormField>
                          <FormField label={`Reminder mode for ${task.publicId}`}>
                            <select
                              value={taskEditForm.reminderMode}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
                                  reminderMode: event.target.value as TaskReminderMode,
                                })
                              }
                            >
                              {reminderModes.map((mode) => (
                                <option key={mode.value} value={mode.value}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                          </FormField>
                          <div className="form-actions">
                            <button className="primary-button" type="submit">
                              Save task {task.publicId}
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => {
                                setEditingTaskPublicId(null);
                                setTaskEditForm(emptyTaskForm);
                              }}
                            >
                              Cancel edit {task.publicId}
                            </button>
                          </div>
                        </form>
                        <AuditLog events={taskAudits[task.publicId] ?? []} />
                      </>
                    ) : null}
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
