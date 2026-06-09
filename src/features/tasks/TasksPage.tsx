import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { PersonDto, TaskDto, TaskStatus } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { StatusBadge } from "../../components/StatusBadge";

const statuses: TaskStatus[] = ["Open", "In Progress", "Blocked", "Done"];

type TaskFormState = {
  publicId: string;
  description: string;
  assigneePublicId: string;
  status: TaskStatus;
  dueDate: string;
  originMeetingPublicId: string | null;
  seriesPublicId: string | null;
};

const emptyTaskForm: TaskFormState = {
  publicId: "",
  description: "",
  assigneePublicId: "",
  status: "Open",
  dueDate: "",
  originMeetingPublicId: null,
  seriesPublicId: null,
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [assigneePublicId, setAssigneePublicId] = useState("");
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (assigneePublicId) params.set("assigneePublicId", assigneePublicId);
    if (status) params.set("status", status);
    if (alert) params.set("alert", alert);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [assigneePublicId, status, alert]);

  async function loadTasks() {
    setTasks((await api.tasks.list(query)).tasks);
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
    };

    if (form.publicId) await api.tasks.update(form.publicId, body);
    else await api.tasks.create(body);

    setForm(emptyTaskForm);
    await loadTasks();
  }

  function editTask(task: TaskDto) {
    setForm({
      publicId: task.publicId,
      description: task.description,
      assigneePublicId: task.assignee?.publicId ?? "",
      status: task.status,
      dueDate: task.dueDate ?? "",
      originMeetingPublicId: task.originMeetingPublicId,
      seriesPublicId: task.seriesPublicId,
    });
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
        <div className="form-actions">
          <button className="primary-button" type="submit">
            {form.publicId ? "Update task" : "Add task"}
          </button>
          {form.publicId ? (
            <button className="secondary-button" type="button" onClick={() => setForm(emptyTaskForm)}>
              Cancel edit
            </button>
          ) : null}
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
        <div className="record-list">
          {tasks.map((task) => (
            <article className="record-row" key={task.publicId}>
              <div>
                <strong>{task.description}</strong>
                <span>{task.publicId}</span>
              </div>
              <StatusBadge label={task.status} />
              {task.alert === "dueSoon" ? <StatusBadge label="Due soon" tone="warn" /> : null}
              {task.alert === "overdue" ? <StatusBadge label="Overdue" tone="bad" /> : null}
              <span>{task.assignee?.name ?? "Unassigned"}</span>
              <span>{task.dueDate ?? "No due date"}</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => editTask(task)}
                aria-label={`Edit ${task.publicId}`}
              >
                Edit
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
