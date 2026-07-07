import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronDown, Mail, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type {
  AuditLogDto,
  PersonDto,
  TaskDependencyDto,
  TaskDto,
  TaskStatus,
} from "../../../shared/types";
import { ApiError, api } from "../../api/client";
import { hasActiveBlockers, hasClearedBlockers } from "../../blockers";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { collapseLinks, LinkedText, type RecordReferenceTarget } from "../../components/LinkedText";
import { MarkdownNotesEditor, RichNoteText } from "../../components/RichNotes";
import { StatusBadge } from "../../components/StatusBadge";
import { scrollRecordIntoView } from "../../recordFocus";
import { comparePublicRecordNumber } from "../../recordSort";

const statuses: TaskStatus[] = ["Open", "In Progress", "Blocked", "Done"];

type TaskLane = {
  key: string;
  title: string;
  ariaLabel: string;
  tone: "bad" | "warn" | "info" | "good" | "neutral";
  tasks: TaskDto[];
};

type TaskArchiveView = "active" | "archived";

export type TaskReferenceTarget = {
  publicId: string;
  type: "decision" | "meeting" | "series";
};

type TaskFormState = {
  description: string;
  blockers: string;
  notes: string;
  blockersCleared: boolean;
  assigneePublicId: string;
  status: TaskStatus;
  dueDate: string;
  originMeetingPublicId: string | null;
  originDecisionPublicId: string | null;
  seriesPublicId: string | null;
  dependencyPublicIds: string[];
  private: boolean;
};

const emptyTaskForm: TaskFormState = {
  description: "",
  blockers: "",
  notes: "",
  blockersCleared: false,
  assigneePublicId: "",
  status: "Open",
  dueDate: "",
  originMeetingPublicId: null,
  originDecisionPublicId: null,
  seriesPublicId: null,
  dependencyPublicIds: [],
  private: false,
};

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function singleLineText(value: string, fallback: string) {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? collapseLinks(compact) : fallback;
}

function dependencyOptionLabel(task: TaskDependencyDto) {
  const status = task.archived ? "Archived" : task.status;
  return `${task.publicId} - ${singleLineText(task.description, "Untitled task")} (${status})`;
}

function taskHasOpenDependencies(task: TaskDto) {
  return (task.dependencies ?? []).some(
    (dependency) => dependency.status !== "Done" && !dependency.archived,
  );
}

function TaskReferenceChip({
  label,
  onOpen,
  publicId,
  type,
}: {
  label: string;
  onOpen?: (target: TaskReferenceTarget) => void;
  publicId: string;
  type: TaskReferenceTarget["type"];
}) {
  if (!onOpen) return <span className="hint-chip">{label}</span>;

  return (
    <button
      className="hint-chip hint-chip-button"
      type="button"
      onClick={() => onOpen({ publicId, type })}
      aria-label={`Open ${type} ${publicId}`}
    >
      {label}
    </button>
  );
}

function buildDependencyOptions(
  tasks: TaskDto[],
  selectedDependencies: TaskDependencyDto[] = [],
  currentTaskPublicId?: string,
) {
  const options = new Map<string, TaskDependencyDto>();

  for (const task of tasks) {
    if (task.publicId === currentTaskPublicId || task.archived) continue;
    options.set(task.publicId, {
      publicId: task.publicId,
      description: task.description,
      status: task.status,
      archived: task.archived,
    });
  }

  for (const dependency of selectedDependencies) {
    if (dependency.publicId === currentTaskPublicId) continue;
    options.set(dependency.publicId, dependency);
  }

  return Array.from(options.values()).sort(comparePublicRecordNumber);
}

function selectedDependencyOptions(publicIds: string[], options: TaskDependencyDto[]) {
  const optionsByPublicId = new Map(options.map((option) => [option.publicId, option]));
  return publicIds.map(
    (publicId) =>
      optionsByPublicId.get(publicId) ?? {
        publicId,
        description: "Selected task",
        status: "Open" as TaskStatus,
        archived: false,
      },
  );
}

function addDependency(publicIds: string[], publicId: string) {
  if (!publicId || publicIds.includes(publicId)) return publicIds;
  return [...publicIds, publicId];
}

function removeDependency(publicIds: string[], publicId: string) {
  return publicIds.filter((item) => item !== publicId);
}

function taskCardTone(task: TaskDto) {
  if (task.archived) return "record-card-neutral";
  if (hasActiveBlockers(task)) return "record-card-bad";
  if (task.alert === "overdue") return "record-card-bad";
  if (task.alert === "dueSoon") return "record-card-warn";
  if (task.status === "Done") return "record-card-good";
  return "record-card-info";
}

export function TasksPage({
  focusTaskPublicId,
  onReferenceOpen,
  onTaskFocusHandled,
}: {
  focusTaskPublicId?: string | null;
  onReferenceOpen?: (target: RecordReferenceTarget) => void;
  onTaskFocusHandled?: () => void;
}) {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [assigneePublicId, setAssigneePublicId] = useState("");
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [taskArchiveView, setTaskArchiveView] = useState<TaskArchiveView>("active");
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const [editingTaskPublicId, setEditingTaskPublicId] = useState<string | null>(null);
  const [taskEditForm, setTaskEditForm] = useState<TaskFormState>(emptyTaskForm);
  const [expandedTaskPublicIds, setExpandedTaskPublicIds] = useState<Record<string, boolean>>({});
  const [taskAudits, setTaskAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [pendingReminderPublicId, setPendingReminderPublicId] = useState<string | null>(null);
  const [reminderFeedback, setReminderFeedback] = useState<Record<string, string>>({});
  const taskLoadRequestId = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (taskArchiveView === "archived") params.set("archived", "true");
    if (assigneePublicId) params.set("assigneePublicId", assigneePublicId);
    if (status) params.set("status", status);
    if (alert) params.set("alert", alert);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [assigneePublicId, status, alert, taskArchiveView]);

  const taskLanes = useMemo<TaskLane[]>(() => {
    if (taskArchiveView === "archived") {
      return tasks.length > 0
        ? [
            {
              key: "archived",
              title: "Archived",
              ariaLabel: "Archived tasks",
              tone: "neutral",
              tasks,
            },
          ]
        : [];
    }

    const blocked = tasks.filter((task) => hasActiveBlockers(task));
    const overdue = tasks.filter((task) => !hasActiveBlockers(task) && task.alert === "overdue");
    const dueSoon = tasks.filter((task) => !hasActiveBlockers(task) && task.alert === "dueSoon");
    const active = tasks.filter(
      (task) => !hasActiveBlockers(task) && !task.alert && task.status !== "Done",
    );
    const done = tasks.filter(
      (task) => !hasActiveBlockers(task) && !task.alert && task.status === "Done",
    );

    const lanes: TaskLane[] = [
      {
        key: "blockers",
        title: "Blockers",
        ariaLabel: "Tasks with blockers",
        tone: "bad",
        tasks: blocked,
      },
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
  }, [taskArchiveView, tasks]);

  const activeTaskFilterLabels = useMemo(() => {
    const assigneeName =
      people.find((person) => person.publicId === assigneePublicId)?.name ?? "Selected assignee";
    const alertLabel =
      alert === "dueSoon" ? "Due soon" : alert === "overdue" ? "Overdue" : "";

    return [
      assigneePublicId ? `Assignee: ${assigneeName}` : null,
      status ? `Status: ${status}` : null,
      alertLabel ? `Due date: ${alertLabel}` : null,
    ].filter((label): label is string => Boolean(label));
  }, [alert, assigneePublicId, people, status]);
  const createDependencyOptions = useMemo(() => buildDependencyOptions(tasks), [tasks]);
  const selectedCreateDependencies = useMemo(
    () => selectedDependencyOptions(form.dependencyPublicIds, createDependencyOptions),
    [createDependencyOptions, form.dependencyPublicIds],
  );

  function clearTaskFilters() {
    setAssigneePublicId("");
    setStatus("");
    setAlert("");
  }

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
      blockers: form.blockers,
      notes: form.notes,
      blockersCleared: form.blockersCleared,
      assigneePublicId: form.assigneePublicId || null,
      status: form.status,
      dueDate: form.dueDate || null,
      originMeetingPublicId: form.originMeetingPublicId,
      originDecisionPublicId: form.originDecisionPublicId,
      seriesPublicId: form.seriesPublicId,
      reminderMode: "manual" as const,
      dependencyPublicIds: form.dependencyPublicIds,
      private: form.private,
    };

    await api.tasks.create(body);
    setForm(emptyTaskForm);
    await loadTasks();
  }

  function editTask(task: TaskDto) {
    expandTask(task.publicId);
    setEditingTaskPublicId(task.publicId);
    setTaskEditForm({
      description: task.description,
      blockers: task.blockers,
      notes: task.notes ?? "",
      blockersCleared: task.blockersClearedAt !== null,
      assigneePublicId: task.assignee?.publicId ?? "",
      status: task.status,
      dueDate: task.dueDate ?? "",
      originMeetingPublicId: task.originMeetingPublicId,
      originDecisionPublicId: task.originDecisionPublicId,
      seriesPublicId: task.seriesPublicId,
      dependencyPublicIds: (task.dependencies ?? []).map((dependency) => dependency.publicId),
      private: task.private,
    });
  }

  function expandTask(taskPublicId: string) {
    setExpandedTaskPublicIds((current) =>
      current[taskPublicId] ? current : { ...current, [taskPublicId]: true },
    );
  }

  function toggleTask(taskPublicId: string) {
    setExpandedTaskPublicIds((current) => ({
      ...current,
      [taskPublicId]: !current[taskPublicId],
    }));
  }

  useEffect(() => {
    if (!focusTaskPublicId) return;
    const task = tasks.find((item) => item.publicId === focusTaskPublicId);
    if (!task) return;

    editTask(task);
    scrollRecordIntoView(`task-${task.publicId}`);
    onTaskFocusHandled?.();
  }, [focusTaskPublicId, onTaskFocusHandled, tasks]);

  async function submitTaskEdit(event: FormEvent<HTMLFormElement>, task: TaskDto) {
    event.preventDefault();
    await api.tasks.update(task.publicId, {
      description: taskEditForm.description,
      blockers: taskEditForm.blockers,
      notes: taskEditForm.notes,
      blockersCleared: taskEditForm.blockersCleared,
      assigneePublicId: taskEditForm.assigneePublicId || null,
      status: taskEditForm.status,
      dueDate: taskEditForm.dueDate || null,
      originMeetingPublicId: taskEditForm.originMeetingPublicId,
      originDecisionPublicId: taskEditForm.originDecisionPublicId,
      seriesPublicId: taskEditForm.seriesPublicId,
      reminderMode: "manual" as const,
      dependencyPublicIds: taskEditForm.dependencyPublicIds,
      private: taskEditForm.private,
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

  async function archiveTask(task: TaskDto) {
    const confirmed = window.confirm(`Archive task ${task.publicId}? You can restore it later.`);
    if (!confirmed) return;

    await api.tasks.archive(task.publicId);
    setEditingTaskPublicId(null);
    setTaskEditForm(emptyTaskForm);
    setExpandedTaskPublicIds((current) => {
      const next = { ...current };
      delete next[task.publicId];
      return next;
    });
    await loadTasks();
  }

  async function restoreTask(task: TaskDto) {
    await api.tasks.restore(task.publicId);
    setExpandedTaskPublicIds((current) => {
      const next = { ...current };
      delete next[task.publicId];
      return next;
    });
    await loadTasks();
  }

  return (
    <main className="page">
      <header className="page-header">
        <h2>Tasks</h2>
        <div className="record-view-toggle" role="group" aria-label="Task archive view">
          <button
            aria-pressed={taskArchiveView === "active"}
            className={taskArchiveView === "active" ? "active" : ""}
            type="button"
            onClick={() => setTaskArchiveView("active")}
          >
            Active
          </button>
          <button
            aria-pressed={taskArchiveView === "archived"}
            className={taskArchiveView === "archived" ? "active" : ""}
            type="button"
            onClick={() => setTaskArchiveView("archived")}
          >
            Archived
          </button>
        </div>
      </header>
      {taskArchiveView === "active" ? (
      <form className="editor-form" onSubmit={submitTask}>
        <FormField label="Task description">
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Task blockers">
          <textarea
            value={form.blockers}
            onChange={(event) =>
              setForm({
                ...form,
                blockers: event.target.value,
                blockersCleared: event.target.value.trim() ? form.blockersCleared : false,
              })
            }
          />
        </FormField>
        <MarkdownNotesEditor
          label="Task notes"
          value={form.notes}
          onChange={(notes) => setForm({ ...form, notes })}
        />
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
        <FormField label="Depends on">
          <div className="dependency-picker">
            <select
              aria-label="Add task dependency"
              disabled={
                createDependencyOptions.filter(
                  (option) => !form.dependencyPublicIds.includes(option.publicId),
                ).length === 0
              }
              value=""
              onChange={(event) =>
                setForm({
                  ...form,
                  dependencyPublicIds: addDependency(
                    form.dependencyPublicIds,
                    event.target.value,
                  ),
                })
              }
            >
              <option value="">
                {createDependencyOptions.length ? "Add dependency" : "No tasks available"}
              </option>
              {createDependencyOptions
                .filter((option) => !form.dependencyPublicIds.includes(option.publicId))
                .map((option) => (
                  <option key={option.publicId} value={option.publicId}>
                    {dependencyOptionLabel(option)}
                  </option>
                ))}
            </select>
            {selectedCreateDependencies.length ? (
              <div className="dependency-chip-row">
                {selectedCreateDependencies.map((dependency) => (
                  <span className="dependency-chip" key={dependency.publicId}>
                    <span>{dependencyOptionLabel(dependency)}</span>
                    <button
                      aria-label={`Remove dependency ${dependency.publicId}`}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          dependencyPublicIds: removeDependency(
                            form.dependencyPublicIds,
                            dependency.publicId,
                          ),
                        })
                      }
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </FormField>
        <div className="form-actions">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={form.private}
              onChange={(event) => setForm({ ...form, private: event.target.checked })}
            />
            <span>Private</span>
          </label>
          <button className="primary-button" type="submit">
            Add task
          </button>
        </div>
      </form>
      ) : null}
      <section className="task-filter-panel" aria-label="Task filters" data-tour-id="task-workflow">
        <div className="task-filter-summary-row">
          <button
            aria-controls="task-filter-fields"
            aria-expanded={filtersExpanded}
            aria-label={filtersExpanded ? "Hide task filters" : "Show task filters"}
            className="task-filter-toggle"
            type="button"
            onClick={() => setFiltersExpanded((current) => !current)}
          >
            <SlidersHorizontal aria-hidden="true" size={16} />
            <span>Filters</span>
            <span className="task-filter-count">
              {activeTaskFilterLabels.length
                ? countLabel(activeTaskFilterLabels.length, "active filter")
                : "All tasks"}
            </span>
            <ChevronDown aria-hidden="true" className="task-filter-chevron" size={16} />
          </button>
          <div className="task-filter-chips" aria-live="polite">
            {activeTaskFilterLabels.length ? (
              activeTaskFilterLabels.map((label) => (
                <span className="task-filter-chip" key={label}>
                  {label}
                </span>
              ))
            ) : (
              <span className="task-filter-empty">All assignees, statuses, and due dates</span>
            )}
          </div>
          {activeTaskFilterLabels.length ? (
            <button
              aria-label="Clear task filters"
              className="secondary-button icon-text-button task-filter-clear"
              type="button"
              onClick={clearTaskFilters}
            >
              <X aria-hidden="true" size={16} />
              Clear
            </button>
          ) : null}
        </div>
        {filtersExpanded ? (
          <div className="filter-bar task-filter-fields" id="task-filter-fields">
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
        ) : null}
      </section>
      {tasks.length === 0 ? (
        <EmptyState
          title={taskArchiveView === "archived" ? "No archived tasks" : "No tasks"}
          detail={
            taskArchiveView === "archived"
              ? "Archived tasks will appear here when you need to retrieve old work."
              : "Create tasks from meetings or as standalone work."
          }
        />
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
                {lane.tasks.map((task) => {
                  const isExpanded = Boolean(expandedTaskPublicIds[task.publicId]);
                  const detailsId = `task-details-${task.publicId}`;
                  const taskSummaryText = singleLineText(task.description, "Untitled task");
                  const dependencies = task.dependencies ?? [];
                  const dependencyCount = dependencies.length;
                  const dependencyBadgeTone = taskHasOpenDependencies(task) ? "warn" : "good";
                  const editDependencyOptions = buildDependencyOptions(
                    tasks,
                    dependencies,
                    task.publicId,
                  );
                  const availableEditDependencies = editDependencyOptions.filter(
                    (option) => !taskEditForm.dependencyPublicIds.includes(option.publicId),
                  );
                  const selectedEditDependencies = selectedDependencyOptions(
                    taskEditForm.dependencyPublicIds,
                    editDependencyOptions,
                  );

                  return (
                  <article
                    aria-label={`Task ${task.publicId}`}
                    className={`task-card ${taskCardTone(task)}`}
                    id={`task-${task.publicId}`}
                    key={task.publicId}
                  >
                    <button
                      aria-controls={detailsId}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} task ${task.publicId} ${taskSummaryText}`}
                      className="task-summary-button"
                      type="button"
                      onClick={() => toggleTask(task.publicId)}
                    >
                      <span className="task-summary-title">
                        <ChevronDown
                          aria-hidden="true"
                          className={`task-expand-icon ${isExpanded ? "task-expand-icon-open" : ""}`}
                          size={17}
                        />
                        <strong>{taskSummaryText}</strong>
                        <span>{task.publicId}</span>
                      </span>
                      <span className="task-summary-meta">
                        <StatusBadge label={task.status} />
                        {task.alert === "dueSoon" ? (
                          <StatusBadge label="Due soon" tone="warn" />
                        ) : null}
                        {task.alert === "overdue" ? (
                          <StatusBadge label="Overdue" tone="bad" />
                        ) : null}
                        {task.private ? <StatusBadge label="Private" tone="warn" /> : null}
                        {task.archived ? <StatusBadge label="Archived" /> : null}
                        {hasActiveBlockers(task) ? <StatusBadge label="Blocker" tone="bad" /> : null}
                        {hasClearedBlockers(task) ? (
                          <StatusBadge label="Blocker cleared" tone="good" />
                        ) : null}
                        {dependencyCount ? (
                          <StatusBadge
                            label={countLabel(dependencyCount, "dependency")}
                            tone={dependencyBadgeTone}
                          />
                        ) : null}
                        <span>{task.assignee?.name ?? "Unassigned"}</span>
                        <span>{task.dueDate ?? "No due date"}</span>
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="task-expanded-content" id={detailsId}>
                        <div className="task-detail-grid">
                          <section className="task-detail-section">
                            <h4>Details</h4>
                            <p>{task.assignee?.name ?? "Unassigned"}</p>
                            <p>{task.dueDate ?? "No due date"}</p>
                            <div className="task-detail-badges">
                              <StatusBadge label={task.status} />
                              {task.originMeetingPublicId ? (
                                <TaskReferenceChip
                                  label={`Meeting ${task.originMeetingPublicId}`}
                                  publicId={task.originMeetingPublicId}
                                  type="meeting"
                                  onOpen={onReferenceOpen}
                                />
                              ) : null}
                              {task.originDecisionPublicId ? (
                                <TaskReferenceChip
                                  label={`Decision ${task.originDecisionPublicId}`}
                                  publicId={task.originDecisionPublicId}
                                  type="decision"
                                  onOpen={onReferenceOpen}
                                />
                              ) : null}
                              {task.seriesPublicId ? (
                                <TaskReferenceChip
                                  label={`Series ${task.seriesPublicId}`}
                                  publicId={task.seriesPublicId}
                                  type="series"
                                  onOpen={onReferenceOpen}
                                />
                              ) : null}
                              {task.private ? <StatusBadge label="Private" tone="warn" /> : null}
                              {task.archived ? <StatusBadge label="Archived" /> : null}
                            </div>
                          </section>
                          <section className="task-detail-section">
                            <h4>Dependencies</h4>
                            {dependencies.length ? (
                              <div className="task-dependency-list">
                                {dependencies.map((dependency) => (
                                  <div
                                    className="task-dependency-item"
                                    key={dependency.publicId}
                                  >
                                    <span>
                                      <strong>
                                        <LinkedText text={dependency.publicId} onRecordOpen={onReferenceOpen} />
                                      </strong>
                                      <span>
                                        <LinkedText
                                          text={singleLineText(dependency.description, "Untitled task")}
                                          onRecordOpen={onReferenceOpen}
                                        />
                                      </span>
                                    </span>
                                    <span className="task-dependency-status">
                                      <StatusBadge
                                        label={dependency.status}
                                        tone={dependency.status === "Done" ? "good" : "warn"}
                                      />
                                      {dependency.archived ? (
                                        <StatusBadge label="Archived" />
                                      ) : null}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p>No dependencies</p>
                            )}
                          </section>
                          <section className="task-detail-section">
                            <h4>Blockers</h4>
                            <p>
                              <LinkedText text={task.blockers || "No blockers"} onRecordOpen={onReferenceOpen} />
                            </p>
                            {task.blockersClearedAt ? (
                              <small>Cleared {new Date(task.blockersClearedAt).toLocaleString()}</small>
                            ) : null}
                          </section>
                          <section className="task-detail-section">
                            <h4>Notes</h4>
                            <RichNoteText text={task.notes ?? ""} onRecordOpen={onReferenceOpen} />
                          </section>
                        </div>
                        <div className="task-card-actions">
                          {task.archived ? (
                          <button
                            className="secondary-button icon-text-button"
                            type="button"
                            onClick={() => restoreTask(task)}
                            aria-label={`Restore task ${task.publicId}`}
                          >
                            <RotateCcw aria-hidden="true" size={16} />
                            Restore task
                          </button>
                          ) : (
                          <>
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
                          </>
                          )}
                        </div>
                        {reminderFeedback[task.publicId] ? (
                          <p className="task-reminder-feedback">
                            {reminderFeedback[task.publicId]}
                          </p>
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
                          <FormField label={`Task blockers for ${task.publicId}`}>
                            <textarea
                              value={taskEditForm.blockers}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
                                  blockers: event.target.value,
                                  blockersCleared: event.target.value.trim()
                                    ? taskEditForm.blockersCleared
                                    : false,
                                })
                              }
                            />
                          </FormField>
                          <MarkdownNotesEditor
                            label={`Task notes for ${task.publicId}`}
                            value={taskEditForm.notes}
                            onChange={(notes) =>
                              setTaskEditForm({
                                ...taskEditForm,
                                notes,
                              })
                            }
                          />
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
                          <FormField label={`Dependencies for ${task.publicId}`}>
                            <div className="dependency-picker">
                              <select
                                aria-label={`Add dependency for ${task.publicId}`}
                                disabled={availableEditDependencies.length === 0}
                                value=""
                                onChange={(event) =>
                                  setTaskEditForm({
                                    ...taskEditForm,
                                    dependencyPublicIds: addDependency(
                                      taskEditForm.dependencyPublicIds,
                                      event.target.value,
                                    ),
                                  })
                                }
                              >
                                <option value="">
                                  {editDependencyOptions.length
                                    ? "Add dependency"
                                    : "No tasks available"}
                                </option>
                                {availableEditDependencies.map((option) => (
                                  <option key={option.publicId} value={option.publicId}>
                                    {dependencyOptionLabel(option)}
                                  </option>
                                ))}
                              </select>
                              {selectedEditDependencies.length ? (
                                <div className="dependency-chip-row">
                                  {selectedEditDependencies.map((dependency) => (
                                    <span className="dependency-chip" key={dependency.publicId}>
                                      <span>{dependencyOptionLabel(dependency)}</span>
                                      <button
                                        aria-label={`Remove dependency ${dependency.publicId}`}
                                        type="button"
                                        onClick={() =>
                                          setTaskEditForm({
                                            ...taskEditForm,
                                            dependencyPublicIds: removeDependency(
                                              taskEditForm.dependencyPublicIds,
                                              dependency.publicId,
                                            ),
                                          })
                                        }
                                      >
                                        <X aria-hidden="true" size={14} />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </FormField>
                          <label className="checkbox-line">
                            <input
                              type="checkbox"
                              checked={taskEditForm.private}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
                                  private: event.target.checked,
                                })
                              }
                            />
                            <span>Private</span>
                          </label>
                          <label className="checkbox-line">
                            <input
                              type="checkbox"
                              checked={taskEditForm.blockersCleared}
                              disabled={!taskEditForm.blockers.trim()}
                              onChange={(event) =>
                                setTaskEditForm({
                                  ...taskEditForm,
                                  blockersCleared: event.target.checked,
                                })
                              }
                            />
                            <span>Blocker cleared</span>
                          </label>
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
                            <button
                              className="danger-button icon-text-button"
                              type="button"
                              onClick={() => archiveTask(task)}
                            >
                              <Archive aria-hidden="true" size={16} />
                              Archive task {task.publicId}
                            </button>
                          </div>
                        </form>
                        <AuditLog events={taskAudits[task.publicId] ?? []} onRecordOpen={onReferenceOpen} />
                      </>
                    ) : null}
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
