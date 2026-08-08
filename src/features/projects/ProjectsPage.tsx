import { Archive, Download, FolderKanban, Plus, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { ProjectDetailDto, ProjectDto, ProjectStatus } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { RichNoteText } from "../../components/RichNotes";
import { StatusBadge } from "../../components/StatusBadge";

type ProjectsPageProps = {
  onOpenMeeting: (publicId: string) => void;
};

const statusOptions: Array<{ value: ProjectStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
];

function statusLabel(status: ProjectStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function formatMeetingDate(startsAt: string, precision: "date" | "datetime") {
  const date = new Date(startsAt);
  if (precision === "date") {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function triggerDownload(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProjectsPage({ onOpenMeeting }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ProjectDto[]>([]);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetailDto | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(preferredPublicId = selectedPublicId) {
    const [active, archived] = await Promise.all([
      api.projects.list(),
      api.projects.list(true),
    ]);
    setProjects(active.projects);
    setArchivedProjects(archived.projects);
    const nextPublicId =
      preferredPublicId && active.projects.some((project) => project.publicId === preferredPublicId)
        ? preferredPublicId
        : active.projects[0]?.publicId ?? null;
    setSelectedPublicId(nextPublicId);
    setDetail(nextPublicId ? (await api.projects.get(nextPublicId)).project : null);
  }

  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Projects could not be loaded.");
    });
  }, []);

  async function selectProject(publicId: string) {
    setSelectedPublicId(publicId);
    setError("");
    try {
      setDetail((await api.projects.get(publicId)).project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project could not be loaded.");
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api.projects.create({ name, description, status });
      setName("");
      setDescription("");
      setStatus("active");
      await load(result.project.publicId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(nextStatus: ProjectStatus) {
    if (!detail) return;
    const result = await api.projects.update(detail.publicId, {
      name: detail.name,
      description: detail.description,
      status: nextStatus,
    });
    await load(result.project.publicId);
  }

  async function archiveProject() {
    if (!detail || !window.confirm(`Archive project ${detail.name}?`)) return;
    await api.projects.archive(detail.publicId);
    await load(null);
  }

  async function restoreProject(publicId: string) {
    const result = await api.projects.restore(publicId);
    await load(result.project.publicId);
  }

  async function exportProjects(format: "markdown" | "json") {
    const content =
      format === "markdown"
        ? await api.projects.exportMarkdown()
        : await api.projects.exportJson();
    triggerDownload(
      content,
      `followthrough-projects.${format === "markdown" ? "md" : "json"}`,
      format === "markdown" ? "text/markdown" : "application/json",
    );
  }

  return (
    <main className="page projects-page">
      <header className="page-header projects-header">
        <div>
          <p className="eyebrow">Project-centered workspace</p>
          <h1>Projects</h1>
          <p className="muted">Meetings preserve context; projects collect the work.</p>
        </div>
        <div className="project-export-actions">
          <button className="secondary-button icon-text-button" type="button" onClick={() => exportProjects("markdown")}>
            <Download aria-hidden="true" size={16} /> Export Markdown
          </button>
          <button className="secondary-button" type="button" onClick={() => exportProjects("json")}>
            Export JSON
          </button>
        </div>
      </header>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <section className="projects-layout">
        <aside className="project-list-panel">
          <form className="project-create-form" onSubmit={createProject}>
            <h2>New project</h2>
            <FormField label="Project name">
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </FormField>
            <FormField label="Description">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </FormField>
            <FormField label="Status">
              <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </FormField>
            <button className="primary-button icon-text-button" disabled={saving} type="submit">
              <Plus aria-hidden="true" size={16} /> {saving ? "Adding" : "Add project"}
            </button>
          </form>

          <div className="project-list" aria-label="Active projects">
            {projects.map((project) => (
              <button
                className={project.publicId === selectedPublicId ? "project-list-item active" : "project-list-item"}
                key={project.publicId}
                type="button"
                onClick={() => selectProject(project.publicId)}
              >
                <span><FolderKanban aria-hidden="true" size={16} /> {project.name}</span>
                <small>{project.noteCount} notes · {project.meetingCount} meetings</small>
              </button>
            ))}
          </div>

          {archivedProjects.length ? (
            <details className="archived-projects">
              <summary>Archived projects ({archivedProjects.length})</summary>
              {archivedProjects.map((project) => (
                <button className="secondary-button icon-text-button" key={project.publicId} type="button" onClick={() => restoreProject(project.publicId)}>
                  <RotateCcw aria-hidden="true" size={15} /> Restore {project.name}
                </button>
              ))}
            </details>
          ) : null}
        </aside>

        {!detail ? (
          <EmptyState title="No projects yet" detail="Create a project without changing any existing meeting notes." />
        ) : (
          <article className="project-detail">
            <header className="project-detail-header">
              <div>
                <p className="record-kicker">{detail.publicId}</p>
                <h2>{detail.name}</h2>
                {detail.description ? <p>{detail.description}</p> : null}
              </div>
              <div className="project-detail-actions">
                <select aria-label={`Status for ${detail.name}`} value={detail.status} onChange={(event) => updateStatus(event.target.value as ProjectStatus)}>
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button className="icon-button" aria-label={`Archive ${detail.name}`} type="button" onClick={archiveProject}>
                  <Archive aria-hidden="true" size={17} />
                </button>
              </div>
            </header>

            <div className="project-metrics">
              <span>{detail.noteCount} notes</span>
              <span>{detail.meetingCount} meetings</span>
              <span>{detail.taskCount} tasks</span>
              <span>{detail.decisionCount} decisions</span>
            </div>

            <section className="project-activity-section">
              <h3>Project notes</h3>
              {detail.notes.length === 0 ? <p className="muted">No project notes yet.</p> : detail.notes.map((note) => (
                <article className="project-note-card" key={note.publicId}>
                  <header>
                    <StatusBadge label={statusLabel(detail.status)} />
                    <span>{note.noteType}</span>
                    <button className="text-button" type="button" onClick={() => onOpenMeeting(note.meeting.publicId)}>
                      {note.meeting.title} · {formatMeetingDate(note.meeting.startsAt, note.meeting.timePrecision)}
                    </button>
                  </header>
                  <RichNoteText text={note.body} />
                </article>
              ))}
            </section>

            <section className="project-activity-section">
              <h3>Meetings</h3>
              {detail.meetings.length === 0 ? <p className="muted">No linked meetings.</p> : detail.meetings.map((meeting) => (
                <button className="project-meeting-row" key={meeting.publicId} type="button" onClick={() => onOpenMeeting(meeting.publicId)}>
                  <span>{meeting.title}</span>
                  <small>{formatMeetingDate(meeting.startsAt, meeting.timePrecision)}</small>
                </button>
              ))}
            </section>
          </article>
        )}
      </section>
    </main>
  );
}
