import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  CircleCheckBig,
  ClipboardCopy,
  Download,
  Gauge,
  ListChecks,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { api, type DashboardMeeting, type DashboardTask } from "../../api/client";
import { hasActiveBlockers, hasBlockers, hasClearedBlockers } from "../../blockers";
import { EmptyState } from "../../components/EmptyState";
import { collapseLinks, LinkedText, type RecordReferenceTarget } from "../../components/LinkedText";
import { PaginatedItems } from "../../components/PaginatedItems";
import { StatusBadge } from "../../components/StatusBadge";

type DashboardSummary = Awaited<ReturnType<typeof api.dashboard>>;

export type DashboardRecordTarget = {
  publicId: string;
  type: "task" | "meeting" | "decision";
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function focusLine(summary: DashboardSummary) {
  const blockerCount = summary.activeBlockers.tasks.length + summary.activeBlockers.meetings.length;
  if (blockerCount > 0) {
    return `${countLabel(blockerCount, "blocker")} ${blockerCount === 1 ? "needs" : "need"} attention first.`;
  }
  if (summary.alerts.overdue.length > 0) {
    return `${countLabel(summary.alerts.overdue.length, "overdue task")} ${
      summary.alerts.overdue.length === 1 ? "needs" : "need"
    } recovery.`;
  }
  if (summary.alerts.dueSoon.length > 0) {
    return `${countLabel(summary.alerts.dueSoon.length, "task")} ${
      summary.alerts.dueSoon.length === 1 ? "is" : "are"
    } due soon.`;
  }
  return "No urgent work is flagged right now.";
}

function triggerTextDownload(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function DashboardMetric({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  tone?: "neutral" | "warn" | "bad" | "good";
}) {
  return (
    <section className={`dashboard-metric dashboard-metric-${tone}`}>
      <span className="dashboard-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="dashboard-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  count,
  id,
}: {
  eyebrow: string;
  title: string;
  count?: string;
  id: string;
}) {
  return (
    <div className="dashboard-section-heading">
      <div>
        <p className="dashboard-section-kicker">{eyebrow}</p>
        <h3 id={id}>{title}</h3>
      </div>
      {count ? <span className="dashboard-count-pill">{count}</span> : null}
    </div>
  );
}

function TaskLine({
  task,
  onOpenTask,
  onRecordReferenceOpen,
}: {
  task: DashboardTask;
  onOpenTask: (publicId: string) => void;
  onRecordReferenceOpen?: (target: RecordReferenceTarget) => void;
}) {
  return (
    <li className={`compact-task-line${hasActiveBlockers(task) ? " compact-task-line-hot" : ""}`}>
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
          <LinkedText text={task.description} onRecordOpen={onRecordReferenceOpen} />
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
            <LinkedText text={task.blockers} onRecordOpen={onRecordReferenceOpen} />
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
    <li className={`compact-clickable-item${hasActiveBlockers(meeting) ? " compact-task-line-hot" : ""}`}>
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
  onRecordReferenceOpen,
}: {
  onOpenRecord: (target: DashboardRecordTarget) => void;
  onRecordReferenceOpen?: (target: RecordReferenceTarget) => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [expandedAssigneeKey, setExpandedAssigneeKey] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  const blockerTaskCount = summary?.activeBlockers.tasks.length ?? 0;
  const blockerMeetingCount = summary?.activeBlockers.meetings.length ?? 0;
  const blockerCount = blockerTaskCount + blockerMeetingCount;
  const overdueCount = summary?.alerts.overdue.length ?? 0;
  const dueSoonCount = summary?.alerts.dueSoon.length ?? 0;
  const openTaskCount =
    summary?.openTasksByAssignee.reduce((total, group) => total + group.tasks.length, 0) ?? 0;
  const maxAssigneeTaskCount = Math.max(
    1,
    ...(summary?.openTasksByAssignee.map((group) => group.tasks.length) ?? [0]),
  );

  useEffect(() => {
    void api.dashboard().then(setSummary);
  }, []);

  async function copySummary() {
    setExportStatus("");
    try {
      const report = await api.dashboardExport("markdown");
      await navigator.clipboard.writeText(report);
      setExportStatus("Summary copied");
    } catch {
      setExportStatus("Unable to copy summary");
    }
  }

  async function downloadSummary() {
    setExportStatus("");
    try {
      const report = await api.dashboardExport("markdown");
      triggerTextDownload("followthrough-summary.md", report, "text/markdown");
      setExportStatus("Summary downloaded");
    } catch {
      setExportStatus("Unable to download summary");
    }
  }

  return (
    <main className="page dashboard-page">
      <section
        className="dashboard-hero"
        aria-labelledby="dashboard-heading"
        data-tour-id="dashboard-overview"
      >
        <div className="dashboard-hero-copy">
          <p className="marketing-eyebrow dashboard-eyebrow">Command center</p>
          <h2 id="dashboard-heading">Workspace</h2>
          <p>{summary ? focusLine(summary) : "Loading workspace signals..."}</p>
        </div>
        <div className="dashboard-pulse" aria-label="Workspace pulse">
          <div className="dashboard-pulse-row">
            <span>Blockers</span>
            <strong>{blockerCount}</strong>
          </div>
          <div className="dashboard-pulse-row">
            <span>Open tasks</span>
            <strong>{openTaskCount}</strong>
          </div>
          <div className="dashboard-pulse-row dashboard-pulse-row-hot">
            <span>Due soon</span>
            <strong>{dueSoonCount}</strong>
          </div>
        </div>
      </section>

      <div className="dashboard-metrics">
        <DashboardMetric
          label="Active blockers"
          value={blockerCount}
          detail={`${countLabel(blockerTaskCount, "task")} / ${countLabel(
            blockerMeetingCount,
            "meeting",
          )}`}
          icon={<AlertTriangle size={18} />}
          tone={blockerCount > 0 ? "bad" : "good"}
        />
        <DashboardMetric
          label="Overdue"
          value={overdueCount}
          detail={overdueCount === 1 ? "Needs recovery" : "Need recovery"}
          icon={<Gauge size={18} />}
          tone={overdueCount > 0 ? "warn" : "good"}
        />
        <DashboardMetric
          label="Due soon"
          value={dueSoonCount}
          detail="Next 7 days"
          icon={<CalendarClock size={18} />}
          tone={dueSoonCount > 0 ? "neutral" : "good"}
        />
        <DashboardMetric
          label="Open tasks"
          value={openTaskCount}
          detail={`${countLabel(summary?.openTasksByAssignee.length ?? 0, "owner")} with work`}
          icon={<ListChecks size={18} />}
          tone="neutral"
        />
      </div>

      {summary ? (
        <section className="dashboard-section dashboard-momentum" aria-labelledby="momentum-heading">
          <div>
            <p className="dashboard-section-kicker">Momentum</p>
            <h3 id="momentum-heading">Recent movement</h3>
          </div>
          <div className="dashboard-trend-grid">
            <DashboardMetric
              label="Done this week"
              value={summary.trends.tasksCompletedThisWeek}
              detail="Closed tasks"
              icon={<TrendingUp size={18} />}
              tone="good"
            />
            <DashboardMetric
              label="Done this month"
              value={summary.trends.tasksCompletedThisMonth}
              detail="Closed tasks"
              icon={<CircleCheckBig size={18} />}
              tone="good"
            />
            <DashboardMetric
              label="Decisions"
              value={summary.trends.decisionsMadeThisMonth}
              detail="This month"
              icon={<ListChecks size={18} />}
              tone="neutral"
            />
            <DashboardMetric
              label="Meetings"
              value={summary.trends.meetingsHeldThisMonth}
              detail="This month"
              icon={<CalendarClock size={18} />}
              tone="neutral"
            />
          </div>
          <div className="dashboard-export-actions">
            <button className="secondary-button" type="button" onClick={copySummary}>
              <ClipboardCopy aria-hidden="true" size={16} />
              Copy summary
            </button>
            <button className="secondary-button" type="button" onClick={downloadSummary}>
              <Download aria-hidden="true" size={16} />
              Download Markdown
            </button>
            {exportStatus ? <span className="form-status">{exportStatus}</span> : null}
          </div>
        </section>
      ) : null}

      {summary ? (
        <div className="dashboard-layout">
          <div className="dashboard-main-column">
            <section
              className="dashboard-section dashboard-section-priority"
              aria-labelledby="active-blockers-heading"
            >
              <SectionHeading
                eyebrow="Priority"
                title="Active blockers"
                count={countLabel(blockerCount, "item")}
                id="active-blockers-heading"
              />
              {summary.activeBlockers.tasks.length === 0 &&
              summary.activeBlockers.meetings.length === 0 ? (
                <EmptyState title="No blockers" detail="Tasks and meetings with active blockers will appear here." />
              ) : (
                <div className="dashboard-blocker-list">
                  {summary.activeBlockers.meetings.length > 0 ? (
                    <div className="dashboard-sublist">
                      <span className="dashboard-sublist-label">Meetings</span>
                      <PaginatedItems
                        items={summary.activeBlockers.meetings}
                        itemName="meeting"
                        pageSize={5}
                        getItemKey={(meeting) => meeting.publicId}
                      >
                        {(visibleMeetings) => (
                          <ul className="compact-list dashboard-record-list">
                            {visibleMeetings.map((meeting) => (
                              <MeetingLine
                                key={meeting.publicId}
                                meeting={meeting}
                                onOpenMeeting={(publicId) => onOpenRecord({ type: "meeting", publicId })}
                              />
                            ))}
                          </ul>
                        )}
                      </PaginatedItems>
                    </div>
                  ) : null}
                  {summary.activeBlockers.tasks.length > 0 ? (
                    <div className="dashboard-sublist">
                      <span className="dashboard-sublist-label">Tasks</span>
                      <PaginatedItems
                        items={summary.activeBlockers.tasks}
                        itemName="task"
                        pageSize={5}
                        getItemKey={(task) => task.publicId}
                      >
                        {(visibleTasks) => (
                          <ul className="compact-list compact-task-list dashboard-record-list">
                            {visibleTasks.map((task) => (
                              <TaskLine
                                key={task.publicId}
                                task={task}
                                onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                                onRecordReferenceOpen={onRecordReferenceOpen}
                              />
                            ))}
                          </ul>
                        )}
                      </PaginatedItems>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <div className="dashboard-task-columns">
              <section className="dashboard-section" aria-labelledby="overdue-tasks-heading">
                <SectionHeading
                  eyebrow="Recovery"
                  title="Overdue tasks"
                  count={countLabel(overdueCount, "task")}
                  id="overdue-tasks-heading"
                />
                {summary.alerts.overdue.length === 0 ? (
                  <EmptyState title="No overdue tasks" detail="Tasks past their due date will appear here." />
                ) : (
                  <PaginatedItems
                    items={summary.alerts.overdue}
                    itemName="task"
                    pageSize={5}
                    getItemKey={(task) => task.publicId}
                  >
                    {(visibleTasks) => (
                      <ul className="compact-list compact-task-list dashboard-record-list">
                        {visibleTasks.map((task) => (
                          <TaskLine
                            key={task.publicId}
                            task={task}
                            onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                            onRecordReferenceOpen={onRecordReferenceOpen}
                          />
                        ))}
                      </ul>
                    )}
                  </PaginatedItems>
                )}
              </section>
              <section className="dashboard-section" aria-labelledby="due-soon-tasks-heading">
                <SectionHeading
                  eyebrow="Upcoming"
                  title="Due soon tasks"
                  count={countLabel(dueSoonCount, "task")}
                  id="due-soon-tasks-heading"
                />
                {summary.alerts.dueSoon.length === 0 ? (
                  <EmptyState title="No tasks due soon" detail="Tasks nearing their due date will appear here." />
                ) : (
                  <PaginatedItems
                    items={summary.alerts.dueSoon}
                    itemName="task"
                    pageSize={5}
                    getItemKey={(task) => task.publicId}
                  >
                    {(visibleTasks) => (
                      <ul className="compact-list compact-task-list dashboard-record-list">
                        {visibleTasks.map((task) => (
                          <TaskLine
                            key={task.publicId}
                            task={task}
                            onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                            onRecordReferenceOpen={onRecordReferenceOpen}
                          />
                        ))}
                      </ul>
                    )}
                  </PaginatedItems>
                )}
              </section>
            </div>

            <section className="dashboard-section" aria-labelledby="open-tasks-heading">
              <SectionHeading
                eyebrow="Ownership"
                title="Open tasks by assignee"
                count={countLabel(openTaskCount, "task")}
                id="open-tasks-heading"
              />
              {summary.openTasksByAssignee.length === 0 ? (
                <EmptyState title="No open tasks" detail="Open tasks will be grouped by assignee." />
              ) : (
                <PaginatedItems
                  items={summary.openTasksByAssignee}
                  itemName="assignee"
                  pageSize={8}
                  getItemKey={(group) => group.assignee?.publicId ?? "unassigned"}
                >
                  {(visibleGroups) => (
                    <ul className="compact-list dashboard-assignee-list">
                      {visibleGroups.map((group) => {
                        const groupBlockerCount = group.tasks.filter((task) => hasActiveBlockers(task)).length;
                        const assigneeKey = group.assignee?.publicId ?? "unassigned";
                        const assigneeName = group.assignee?.name ?? "Unassigned";
                        const isExpanded = expandedAssigneeKey === assigneeKey;
                        const taskListId = `dashboard-assignee-${assigneeKey}-tasks`;
                        return (
                          <li
                            className={`dashboard-assignee-item${isExpanded ? " is-expanded" : ""}`}
                            key={assigneeKey}
                          >
                            <button
                              className="dashboard-assignee-row"
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={taskListId}
                              aria-label={`${isExpanded ? "Hide" : "Show"} open tasks for ${assigneeName}`}
                              onClick={() =>
                                setExpandedAssigneeKey((current) =>
                                  current === assigneeKey ? null : assigneeKey,
                                )
                              }
                            >
                              <span className="dashboard-assignee-avatar" aria-hidden="true">
                                <UsersRound size={16} />
                              </span>
                              <span className="dashboard-assignee-main">
                                <strong>{assigneeName}</strong>
                                <span>{countLabel(group.tasks.length, "open task")}</span>
                                <span className="dashboard-assignee-meter" aria-hidden="true">
                                  <span
                                    style={{
                                      width: `${Math.max(10, (group.tasks.length / maxAssigneeTaskCount) * 100)}%`,
                                    }}
                                  />
                                </span>
                              </span>
                              {groupBlockerCount > 0 ? (
                                <StatusBadge label={countLabel(groupBlockerCount, "blocker")} tone="bad" />
                              ) : (
                                <StatusBadge label="Clear" tone="good" />
                              )}
                              <ChevronDown className="dashboard-assignee-chevron" aria-hidden="true" size={18} />
                            </button>
                            {isExpanded ? (
                              <div className="dashboard-assignee-task-panel" id={taskListId}>
                                <PaginatedItems
                                  items={group.tasks}
                                  itemName="task"
                                  pageSize={6}
                                  getItemKey={(task) => task.publicId}
                                >
                                  {(visibleTasks) => (
                                    <ul className="compact-list compact-task-list dashboard-record-list">
                                      {visibleTasks.map((task) => (
                                        <TaskLine
                                          key={task.publicId}
                                          task={task}
                                          onOpenTask={(publicId) => onOpenRecord({ type: "task", publicId })}
                                          onRecordReferenceOpen={onRecordReferenceOpen}
                                        />
                                      ))}
                                    </ul>
                                  )}
                                </PaginatedItems>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PaginatedItems>
              )}
            </section>
          </div>

          <aside className="dashboard-side-column" aria-label="Workspace activity">
            <section className="dashboard-section" aria-labelledby="recent-meetings-heading">
              <SectionHeading
                eyebrow="Meetings"
                title="Recent meetings"
                count={countLabel(summary.recentMeetings.length, "meeting")}
                id="recent-meetings-heading"
              />
              {summary.recentMeetings.length === 0 ? (
                <EmptyState title="No meetings" detail="Recent meetings will appear here." />
              ) : (
                <PaginatedItems
                  items={summary.recentMeetings}
                  itemName="meeting"
                  pageSize={5}
                  getItemKey={(meeting) => meeting.publicId}
                >
                  {(visibleMeetings) => (
                    <ul className="compact-list dashboard-record-list">
                      {visibleMeetings.map((meeting) => (
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
                            <small>{formatDateTime(meeting.startsAt)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </PaginatedItems>
              )}
            </section>
            <section className="dashboard-section" aria-labelledby="recent-decisions-heading">
              <SectionHeading
                eyebrow="Decisions"
                title="Recent decisions"
                count={countLabel(summary.recentDecisions.length, "decision")}
                id="recent-decisions-heading"
              />
              {summary.recentDecisions.length === 0 ? (
                <EmptyState title="No decisions" detail="Recent decisions will appear here." />
              ) : (
                <PaginatedItems
                  items={summary.recentDecisions}
                  itemName="decision"
                  pageSize={5}
                  getItemKey={(decision) => decision.publicId}
                >
                  {(visibleDecisions) => (
                    <ul className="compact-list dashboard-record-list">
                      {visibleDecisions.map((decision) => (
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
                </PaginatedItems>
              )}
            </section>
            <section className="dashboard-section" aria-labelledby="recurring-meetings-heading">
              <SectionHeading
                eyebrow="Rhythm"
                title="Recurring meetings"
                count={countLabel(summary.activeSeries.length, "series", "series")}
                id="recurring-meetings-heading"
              />
              {summary.activeSeries.length === 0 ? (
                <EmptyState title="No recurring meetings" detail="Active meeting series will appear here." />
              ) : (
                <PaginatedItems
                  items={summary.activeSeries}
                  itemName="series"
                  pluralItemName="series"
                  pageSize={5}
                  getItemKey={(series) => series.publicId}
                >
                  {(visibleSeries) => (
                    <ul className="compact-list dashboard-record-list dashboard-series-list">
                      {visibleSeries.map((series) => (
                        <li key={series.publicId}>
                          <span className="dashboard-series-icon" aria-hidden="true">
                            <CircleCheckBig size={16} />
                          </span>
                          <strong>
                            <LinkedText text={series.publicId} onRecordOpen={onRecordReferenceOpen} />
                          </strong>
                          <span>
                            <LinkedText text={series.title} onRecordOpen={onRecordReferenceOpen} />
                          </span>
                          {series.cadenceLabel ? <StatusBadge label={series.cadenceLabel} /> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </PaginatedItems>
              )}
            </section>
          </aside>
        </div>
      ) : (
        <section className="dashboard-section dashboard-loading-panel">
          <EmptyState title="Loading dashboard" detail="Workspace activity is loading." />
        </section>
      )}
    </main>
  );
}
