import { useEffect, useMemo, useState } from "react";
import type { PersonDto, TaskDto, TaskStatus } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";

const statuses: TaskStatus[] = ["Open", "In Progress", "Blocked", "Done"];

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [assigneePublicId, setAssigneePublicId] = useState("");
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (assigneePublicId) params.set("assigneePublicId", assigneePublicId);
    if (status) params.set("status", status);
    if (alert) params.set("alert", alert);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [assigneePublicId, status, alert]);

  useEffect(() => {
    void api.people.list().then((result) => setPeople(result.people));
  }, []);

  useEffect(() => {
    void api.tasks.list(query).then((result) => setTasks(result.tasks));
  }, [query]);

  return (
    <main className="page">
      <header className="page-header">
        <h2>Tasks</h2>
      </header>
      <div className="filter-bar">
        <select
          aria-label="Assignee"
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
          aria-label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select aria-label="Alert" value={alert} onChange={(event) => setAlert(event.target.value)}>
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
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
