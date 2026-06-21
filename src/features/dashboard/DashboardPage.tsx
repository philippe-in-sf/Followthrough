import { useEffect, useState } from "react";
import { api, type DashboardMeeting, type DashboardTask } from "../../api/client";
import { hasActiveBlockers, hasBlockers, hasClearedBlockers } from "../../blockers";
import { EmptyState } from "../../components/EmptyState";
import { collapseLinks, LinkedText } from "../../components/LinkedText";
import { StatusBadge } from "../../components/StatusBadge";

type DashboardSummary = Awaited<ReturnType<typeof api.dashboard>>;

export type DashboardRecordTarget = {
  publicId: string;
  type: "task" | "meeting" | "decision";
};

function TaskLine({
  task,
  onOpenTask,
}: {
  task: DashboardTask;
  onOpenTask: (publicId: string) => void;
}) {
  return (
    <li className="compact-task-line">
      <button
        className="compact-id-button"
        type="button"
        onClick={() => onOpenTask(task.publicId)}
        aria-label={`Open task ${task.publicId}`}
      >
        <strong>{task.publicId}</strong>
      </button>
      <span className="compact-task-body">
        <span className="compact-task-description">
          <LinkedText text={task.description} />
        </span>
        <span className="compact-task-meta">
          <small>{task.assignee?.name ?? "Unassigned"}</small>
          {task.dueDate ? <small>{task.dueDate}</small> : null}
          {task.private ? <small>Private</small> : null}
          {hasActiveBlockers(task) ? <StatusBadge label="Blocker" tone="bad" /> : null}
          {hasClearedBlockers(task) ? (
            <StatusBadge label="Blocker cleared" tone="good" />
          ) : null}
        </span>
        {hasBlockers(task) ? (
          <span
            className={`compact-blocker-text ${
              hasClearedBlockers(task) ? "compact-blocker-text-cleared" : ""
            }`}
          >
            <LinkedText text={task.blockers} />
          </span>
        ) : null}
      </span>
    </li>
  );
}

function MeetingLine({
  meeting,
  onOpenMeeting,
}: {
  meeting: DashboardMeeting;
  onOpenMeeting: (publicId: string) => void;
}) {
  return (
    <li className="compact-clickable-item">
      <button
        className="compact-record-button compact-record-button-stacked"
        type="button"
        onClick={() => onOpenMeeting(meeting.publicId)}
        aria-label={`Open meeting ${meeting.publicId} ${collapseLinks(meeting.title)}`}
      >
        <strong>{meeting.publicId}</strong>
        <span>
          {collapseLinks(meeting.title)}
          {hasActiveBlockers(meeting) ? <StatusBadge label="Blocker" tone="bad" /> : null}
          {hasClearedBlockers(meeting) ? (
            <StatusBadge label="Blocker cleared" tone="good" />
          ) : null}
        </span>
        <small>{new Date(meeting.startsAt).toLocaleString()}</small>
        {hasBlockers(meeting) ? (
          <span
            className={`compact-blocker-text ${
              hasClearedBlockers(meeting) ? "compact-blocker-text-cleared" : ""
            }`}
          >
            {collapseLinks(meeting.blockers)}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function DashboardPage({
  onOpenRecord,
}: {
  onOpenRecord: (target: DashboardRecordTarget) => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    void api.dashboard().then(setSummary);
  }, []);

  return (
    <main className="page">
      <header className="page-header">
        <h2>Workspace</h2>
      </header>
      <div className="summary-grid">
        <section className="summary-panel">
          <h3>Overdue</h3>
          <strong>{summary?.alerts.overdue.length ?? 0}</strong>
        </section>
        <section className="summary-panel">
          <h3>Due soon</h3>
          <strong>{summary?.alerts.dueSoon.length ?? 0}</strong>
        </section>
        <section className="summary-panel summary-panel-bad">
          <h3>Blockers</h3>
          <strong>
            {summary
              ? summary.activeBlockers.tasks.length + summary.activeBlockers.meetings.length
              : 0}
          </strong>
        </section>
      </div>
      {summary ? (
        <div className="dashboard-grid">
          <section className="dashboard-section">
            <h3>Active blockers</h3>
            {summary.activeBlockers.tasks.length === 0 &&
            summary.activeBlockers.meetings.length === 0 ? (
              <EmptyState title="No blockers" detail="Tasks and meetings with active blockers will appear here." />
            ) : (
              <div className="dashboard-blocker-list">
                {summary.activeBlockers.meetings.length > 0 ? (
                  <ul className="compact-list">
                    {summary.activeBlockers.meetings.map((meeting) => (
                      <MeetingLine
                        key={meeting.publicId}
                        meeting={meeting}
                        onOpenMeeting={(publicId) => onOpenRecord({ type: "meeting", publicId })}
                      />
                    ))}
                  </ul>
                ) : null}
                {summary.activeBlockers.tasks.length > 0 ? (
                  <ul className="compact-list compact-task-list">
                    {summary.activeBlockers.tasks.map((task) => (
                      <TaskLine
                        key={task.publicId}
                        task={task}
                        onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </section>
          <section className="dashboard-section">
            <h3>Overdue tasks</h3>
            {summary.alerts.overdue.length === 0 ? (
              <EmptyState title="No overdue tasks" detail="Tasks past their due date will appear here." />
            ) : (
              <ul className="compact-list compact-task-list">
                {summary.alerts.overdue.map((task) => (
                  <TaskLine
                    key={task.publicId}
                    task={task}
                    onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="dashboard-section">
            <h3>Due soon tasks</h3>
            {summary.alerts.dueSoon.length === 0 ? (
              <EmptyState title="No tasks due soon" detail="Tasks nearing their due date will appear here." />
            ) : (
              <ul className="compact-list compact-task-list">
                {summary.alerts.dueSoon.map((task) => (
                  <TaskLine
                    key={task.publicId}
                    task={task}
                    onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="dashboard-section">
            <h3>Open tasks by assignee</h3>
            {summary.openTasksByAssignee.length === 0 ? (
              <EmptyState title="No open tasks" detail="Open tasks will be grouped by assignee." />
            ) : (
              <ul className="compact-list">
                {summary.openTasksByAssignee.map((group) => (
                  <li key={group.assignee?.publicId ?? "unassigned"}>
                    <strong>{group.assignee?.name ?? "Unassigned"}</strong>
                    <span>{group.tasks.length} open</span>
                    {group.tasks.some((task) => hasActiveBlockers(task)) ? (
                      <StatusBadge
                        label={`${group.tasks.filter((task) => hasActiveBlockers(task)).length} blockers`}
                        tone="bad"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="dashboard-section">
            <h3>Recent meetings</h3>
            {summary.recentMeetings.length === 0 ? (
              <EmptyState title="No meetings" detail="Recent meetings will appear here." />
            ) : (
              <ul className="compact-list">
                {summary.recentMeetings.map((meeting) => (
                  <li className="compact-clickable-item" key={meeting.publicId}>
                    <button
                      className="compact-record-button"
                      type="button"
                      onClick={() =>
                        onOpenRecord({ type: "meeting", publicId: meeting.publicId })
                      }
                      aria-label={`Open meeting ${meeting.publicId} ${collapseLinks(meeting.title)}`}
                    >
                      <strong>{meeting.publicId}</strong>
                      <span>{collapseLinks(meeting.title)}</span>
                      <small>{new Date(meeting.startsAt).toLocaleString()}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="dashboard-section">
            <h3>Recent decisions</h3>
            {summary.recentDecisions.length === 0 ? (
              <EmptyState title="No decisions" detail="Recent decisions will appear here." />
            ) : (
              <ul className="compact-list">
                {summary.recentDecisions.map((decision) => (
                  <li className="compact-clickable-item" key={decision.publicId}>
                    <button
                      className="compact-record-button"
                      type="button"
                      onClick={() =>
                        onOpenRecord({ type: "decision", publicId: decision.publicId })
                      }
                      aria-label={`Open decision ${decision.publicId} ${collapseLinks(decision.decisionText)}`}
                    >
                      <strong>{decision.publicId}</strong>
                      <span>{collapseLinks(decision.decisionText)}</span>
                      <small>{decision.decisionDate}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="dashboard-section">
            <h3>Recurring meetings</h3>
            {summary.activeSeries.length === 0 ? (
              <EmptyState title="No recurring meetings" detail="Active meeting series will appear here." />
            ) : (
              <ul className="compact-list">
                {summary.activeSeries.map((series) => (
                  <li key={series.publicId}>
                    <strong>{series.publicId}</strong>
                    <span>
                      <LinkedText text={series.title} />
                    </span>
                    {series.cadenceLabel ? <StatusBadge label={series.cadenceLabel} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
