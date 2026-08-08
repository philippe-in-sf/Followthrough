import type {
  ProjectDetailDto,
  ProjectDto,
  ProjectMeetingDto,
  ProjectNoteDto,
  ProjectNoteType,
  ProjectStatus,
  ProjectSummaryDto,
} from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest, notFound } from "../errors.js";
import { withTransaction } from "../db/ids.js";

type ProjectRow = {
  id: number;
  public_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  archived_at: string | null;
  meeting_count: number;
  note_count: number;
  task_count: number;
  decision_count: number;
};

type ProjectSummaryRow = {
  id: number;
  public_id: string;
  name: string;
  status: ProjectStatus;
};

type ProjectNoteRow = {
  id: number;
  public_id: string;
  body: string;
  note_type: ProjectNoteType;
  sort_order: number;
  created_at: string;
  updated_at: string;
  meeting_public_id: string;
  meeting_title: string;
  starts_at: string;
  time_precision: "date" | "datetime";
};

const projectSelect = `
  SELECT projects.id, projects.public_id, projects.name, projects.description,
         projects.status, projects.archived_at,
         (SELECT COUNT(*) FROM meeting_projects WHERE meeting_projects.project_id = projects.id) AS meeting_count,
         (SELECT COUNT(*) FROM meeting_note_block_projects WHERE meeting_note_block_projects.project_id = projects.id) AS note_count,
         (SELECT COUNT(*) FROM task_projects WHERE task_projects.project_id = projects.id) AS task_count,
         (SELECT COUNT(*) FROM decision_projects WHERE decision_projects.project_id = projects.id) AS decision_count
  FROM projects
`;

export function toProject(row: ProjectRow): ProjectDto {
  return {
    publicId: row.public_id,
    name: row.name,
    description: row.description,
    status: row.status,
    archived: row.archived_at !== null,
    meetingCount: row.meeting_count,
    noteCount: row.note_count,
    taskCount: row.task_count,
    decisionCount: row.decision_count,
  };
}

export function getProjectRow(
  db: AppDatabase,
  publicId: string,
  teamId: number,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `${projectSelect}
       WHERE projects.public_id = ? AND projects.team_id = ?
       ${includeArchived ? "" : "AND projects.archived_at IS NULL"}`,
    )
    .get(publicId, teamId) as ProjectRow | undefined;
  if (!row) throw notFound("Project not found");
  return row;
}

export function listProjects(db: AppDatabase, teamId: number, archived = false) {
  return (
    db
      .prepare(
        `${projectSelect}
         WHERE projects.team_id = ?
         AND projects.archived_at IS ${archived ? "NOT " : ""}NULL
         ORDER BY projects.status = 'completed', projects.name COLLATE NOCASE`,
      )
      .all(teamId) as ProjectRow[]
  ).map(toProject);
}

export function resolveProjectIds(db: AppDatabase, publicIds: string[], teamId: number) {
  const uniqueIds = [...new Set(publicIds)];
  return uniqueIds.map((publicId) => {
    const row = db
      .prepare(
        "SELECT id FROM projects WHERE public_id = ? AND team_id = ? AND archived_at IS NULL",
      )
      .get(publicId, teamId) as { id: number } | undefined;
    if (!row) throw badRequest(`Project not found: ${publicId}`);
    return row.id;
  });
}

function toSummary(row: ProjectSummaryRow): ProjectSummaryDto {
  return { publicId: row.public_id, name: row.name, status: row.status };
}

export function getMeetingProjects(db: AppDatabase, meetingId: number): ProjectSummaryDto[] {
  const rows = db
    .prepare(
      `SELECT projects.id, projects.public_id, projects.name, projects.status
       FROM meeting_projects
       JOIN projects ON projects.id = meeting_projects.project_id
       WHERE meeting_projects.meeting_id = ? AND projects.archived_at IS NULL
       ORDER BY projects.name COLLATE NOCASE`,
    )
    .all(meetingId) as ProjectSummaryRow[];
  return rows.map(toSummary);
}

export function replaceMeetingProjects(
  db: AppDatabase,
  meetingId: number,
  projectPublicIds: string[],
  teamId: number,
) {
  const projectIds = resolveProjectIds(db, projectPublicIds, teamId);
  db.prepare("DELETE FROM meeting_projects WHERE meeting_id = ?").run(meetingId);
  for (const projectId of projectIds) {
    db.prepare("INSERT INTO meeting_projects (meeting_id, project_id) VALUES (?, ?)").run(
      meetingId,
      projectId,
    );
  }
  db.prepare(
    `INSERT OR IGNORE INTO meeting_projects (meeting_id, project_id)
     SELECT meeting_note_blocks.meeting_id, meeting_note_block_projects.project_id
     FROM meeting_note_blocks
     JOIN meeting_note_block_projects
       ON meeting_note_block_projects.note_block_id = meeting_note_blocks.id
     WHERE meeting_note_blocks.meeting_id = ?`,
  ).run(meetingId);
}

export function replaceTaskProjects(
  db: AppDatabase,
  taskId: number,
  projectPublicIds: string[],
  teamId: number,
) {
  const projectIds = resolveProjectIds(db, projectPublicIds, teamId);
  db.prepare("DELETE FROM task_projects WHERE task_id = ?").run(taskId);
  for (const projectId of projectIds) {
    db.prepare("INSERT INTO task_projects (task_id, project_id) VALUES (?, ?)").run(
      taskId,
      projectId,
    );
  }
}

export function replaceDecisionProjects(
  db: AppDatabase,
  decisionId: number,
  projectPublicIds: string[],
  teamId: number,
) {
  const projectIds = resolveProjectIds(db, projectPublicIds, teamId);
  db.prepare("DELETE FROM decision_projects WHERE decision_id = ?").run(decisionId);
  for (const projectId of projectIds) {
    db.prepare("INSERT INTO decision_projects (decision_id, project_id) VALUES (?, ?)").run(
      decisionId,
      projectId,
    );
  }
}

export function inheritedProjectPublicIds(
  db: AppDatabase,
  input: { meetingId?: number | null; decisionId?: number | null },
) {
  const rows = db
    .prepare(
      `SELECT projects.public_id
       FROM projects
       WHERE projects.archived_at IS NULL
       AND (
         projects.id IN (
           SELECT project_id FROM meeting_projects WHERE meeting_id = ?
         ) OR projects.id IN (
           SELECT project_id FROM decision_projects WHERE decision_id = ?
         )
       )
       ORDER BY projects.public_id`,
    )
    .all(input.meetingId ?? null, input.decisionId ?? null) as Array<{ public_id: string }>;
  return rows.map((row) => row.public_id);
}

function getNoteProjects(db: AppDatabase, noteBlockId: number): ProjectSummaryDto[] {
  const rows = db
    .prepare(
      `SELECT projects.id, projects.public_id, projects.name, projects.status
       FROM meeting_note_block_projects
       JOIN projects ON projects.id = meeting_note_block_projects.project_id
       WHERE meeting_note_block_projects.note_block_id = ?
       ORDER BY projects.name COLLATE NOCASE`,
    )
    .all(noteBlockId) as ProjectSummaryRow[];
  return rows.map(toSummary);
}

function toProjectNote(db: AppDatabase, row: ProjectNoteRow): ProjectNoteDto {
  return {
    publicId: row.public_id,
    body: row.body,
    noteType: row.note_type,
    sortOrder: row.sort_order,
    projects: getNoteProjects(db, row.id),
    meeting: {
      publicId: row.meeting_public_id,
      title: row.meeting_title,
      startsAt: row.starts_at,
      timePrecision: row.time_precision,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const noteSelect = `
  SELECT meeting_note_blocks.id, meeting_note_blocks.public_id,
         meeting_note_blocks.body, meeting_note_blocks.note_type,
         meeting_note_blocks.sort_order, meeting_note_blocks.created_at,
         meeting_note_blocks.updated_at,
         meetings.public_id AS meeting_public_id, meetings.title AS meeting_title,
         meetings.starts_at, meetings.time_precision
  FROM meeting_note_blocks
  JOIN meetings ON meetings.id = meeting_note_blocks.meeting_id
`;

export function getMeetingProjectNotes(
  db: AppDatabase,
  meetingId: number,
): ProjectNoteDto[] {
  const rows = db
    .prepare(
      `${noteSelect}
       WHERE meeting_note_blocks.meeting_id = ?
       ORDER BY meeting_note_blocks.sort_order, meeting_note_blocks.created_at`,
    )
    .all(meetingId) as ProjectNoteRow[];
  return rows.map((row) => toProjectNote(db, row));
}

export function getProjectDetail(
  db: AppDatabase,
  publicId: string,
  teamId: number,
  userId: number,
): ProjectDetailDto {
  const project = getProjectRow(db, publicId, teamId);
  const meetings = db
    .prepare(
      `SELECT meetings.public_id AS publicId, meetings.title,
              meetings.starts_at AS startsAt, meetings.time_precision AS timePrecision
       FROM meeting_projects
       JOIN meetings ON meetings.id = meeting_projects.meeting_id
       WHERE meeting_projects.project_id = ? AND meetings.archived_at IS NULL
       AND (meetings.private = 0 OR meetings.created_by_user_id = ?)
       ORDER BY meetings.starts_at DESC`,
    )
    .all(project.id, userId) as ProjectMeetingDto[];
  const notes = (
    db
      .prepare(
        `${noteSelect}
         JOIN meeting_note_block_projects ON meeting_note_block_projects.note_block_id = meeting_note_blocks.id
         WHERE meeting_note_block_projects.project_id = ?
         AND meetings.archived_at IS NULL
         AND (meetings.private = 0 OR meetings.created_by_user_id = ?)
         ORDER BY meetings.starts_at DESC, meeting_note_blocks.sort_order`,
      )
      .all(project.id, userId) as ProjectNoteRow[]
  ).map((row) => toProjectNote(db, row));
  const tasks = db
    .prepare(
      `SELECT tasks.public_id AS publicId, tasks.description, tasks.status,
              tasks.due_date AS dueDate
       FROM task_projects
       JOIN tasks ON tasks.id = task_projects.task_id
       WHERE task_projects.project_id = ? AND tasks.archived_at IS NULL
       AND (tasks.private = 0 OR tasks.created_by_user_id = ?)
       ORDER BY tasks.status IN ('Done', 'Won''t Fix'), tasks.due_date IS NULL, tasks.due_date`,
    )
    .all(project.id, userId) as ProjectDetailDto["tasks"];
  const decisions = db
    .prepare(
      `SELECT decisions.public_id AS publicId, decisions.decision_text AS decisionText,
              decisions.decision_date AS decisionDate
       FROM decision_projects
       JOIN decisions ON decisions.id = decision_projects.decision_id
       LEFT JOIN meetings ON meetings.id = decisions.meeting_id
       WHERE decision_projects.project_id = ? AND decisions.archived_at IS NULL
       AND (meetings.id IS NULL OR meetings.private = 0 OR meetings.created_by_user_id = ?)
       ORDER BY decisions.decision_date DESC`,
    )
    .all(project.id, userId) as ProjectDetailDto["decisions"];

  return {
    ...toProject(project),
    meetingCount: meetings.length,
    noteCount: notes.length,
    taskCount: tasks.length,
    decisionCount: decisions.length,
    meetings,
    notes,
    tasks,
    decisions,
  };
}

function exportMarker(publicId: string) {
  return `<!-- followthrough-project-note:${publicId} -->`;
}

export function projectNoteMarkdown(note: ProjectNoteDto) {
  const projectNames = note.projects.length
    ? note.projects.map((project) => project.name).join(", ")
    : "Unassigned";
  const label = note.noteType.charAt(0).toUpperCase() + note.noteType.slice(1);
  return [
    exportMarker(note.publicId),
    `### ${label} · ${projectNames}`,
    note.body.trim(),
  ].join("\n");
}

export function flattenProjectNotes(db: AppDatabase) {
  return withTransaction(db, () => {
    const meetings = db
      .prepare(
        `SELECT DISTINCT meetings.id, meetings.notes
         FROM meetings
         JOIN meeting_note_blocks ON meeting_note_blocks.meeting_id = meetings.id
         ORDER BY meetings.id`,
      )
      .all() as Array<{ id: number; notes: string }>;
    let notesFlattened = 0;
    let meetingsChanged = 0;

    for (const meeting of meetings) {
      const blocks = getMeetingProjectNotes(db, meeting.id);
      const additions = blocks.filter((block) => !meeting.notes.includes(exportMarker(block.publicId)));
      if (additions.length === 0) continue;
      const section = [
        meeting.notes.trim(),
        "## Project notes",
        ...additions.map(projectNoteMarkdown),
      ]
        .filter(Boolean)
        .join("\n\n");
      db.prepare(
        "UPDATE meetings SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(section, meeting.id);
      notesFlattened += additions.length;
      meetingsChanged += 1;
    }

    return { notesFlattened, meetingsChanged };
  });
}

export function projectExport(db: AppDatabase, teamId: number, userId: number) {
  const projects = listProjects(db, teamId).map((project) =>
    getProjectDetail(db, project.publicId, teamId, userId),
  );
  return { exportedAt: new Date().toISOString(), projects };
}
