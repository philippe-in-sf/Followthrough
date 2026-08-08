import { Router } from "express";
import { projectInputSchema, projectNoteInputSchema } from "../../shared/schemas.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";
import {
  getMeetingProjectNotes,
  getProjectDetail,
  getProjectRow,
  listProjects,
  projectExport,
  projectNoteMarkdown,
  resolveProjectIds,
  toProject,
} from "./store.js";

function requireProjects(config: AppConfig) {
  if (config.projectsEnabled === false) throw notFound("Projects are disabled");
}

function getVisibleMeeting(db: AppDatabase, publicId: string, teamId: number, userId: number) {
  const row = db
    .prepare(
      `SELECT id FROM meetings
       WHERE public_id = ? AND team_id = ? AND archived_at IS NULL
       AND (private = 0 OR created_by_user_id = ?)`,
    )
    .get(publicId, teamId, userId) as { id: number } | undefined;
  if (!row) throw notFound("Meeting not found");
  return row;
}

export function projectRoutes(db: AppDatabase, config: AppConfig) {
  const projectsRouter = Router();
  const meetingProjectsRouter = Router();

  projectsRouter.use((_req, _res, next) => {
    try {
      requireProjects(config);
      next();
    } catch (error) {
      next(error);
    }
  });
  meetingProjectsRouter.use((_req, _res, next) => {
    try {
      requireProjects(config);
      next();
    } catch (error) {
      next(error);
    }
  });

  projectsRouter.get("/", (req, res) => {
    const archived = req.query.archived === "true";
    const projects = listProjects(db, req.user?.teamId ?? 0, archived).map((project) => {
      if (archived) return { ...project, meetingCount: 0, noteCount: 0, taskCount: 0, decisionCount: 0 };
      const { meetings: _meetings, notes: _notes, tasks: _tasks, decisions: _decisions, ...summary } =
        getProjectDetail(db, project.publicId, req.user?.teamId ?? 0, req.user?.id ?? 0);
      return summary;
    });
    res.json({
      projects,
    });
  });

  projectsRouter.get("/export", (req, res) => {
    const exported = projectExport(db, req.user?.teamId ?? 0, req.user?.id ?? 0);
    if (req.query.format === "markdown") {
      const markdown = exported.projects
        .flatMap((project) => [
          `# ${project.name}`,
          project.description,
          ...project.notes.map(projectNoteMarkdown),
        ])
        .filter(Boolean)
        .join("\n\n");
      res.type("text/markdown").send(markdown);
      return;
    }
    res.json(exported);
  });

  projectsRouter.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, projectInputSchema);
      const project = withTransaction(db, () => {
        const publicId = nextPublicId(db, "J");
        db.prepare(
          `INSERT INTO projects
           (public_id, team_id, name, description, status, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          publicId,
          req.user?.teamId ?? 0,
          input.name,
          input.description,
          input.status,
          req.user?.id ?? null,
        );
        return toProject(getProjectRow(db, publicId, req.user?.teamId ?? 0));
      });
      res.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  projectsRouter.get("/:publicId", (req, res, next) => {
    try {
      res.json({
        project: getProjectDetail(
          db,
          req.params.publicId,
          req.user?.teamId ?? 0,
          req.user?.id ?? 0,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  projectsRouter.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, projectInputSchema);
      const result = db
        .prepare(
          `UPDATE projects SET name = ?, description = ?, status = ?,
                  updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND team_id = ? AND archived_at IS NULL`,
        )
        .run(
          input.name,
          input.description,
          input.status,
          req.params.publicId,
          req.user?.teamId ?? 0,
        );
      if (result.changes === 0) throw notFound("Project not found");
      res.json({
        project: toProject(getProjectRow(db, req.params.publicId, req.user?.teamId ?? 0)),
      });
    } catch (error) {
      next(error);
    }
  });

  projectsRouter.post("/:publicId/archive", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE projects SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND team_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId, req.user?.teamId ?? 0);
      if (result.changes === 0) throw notFound("Project not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  projectsRouter.post("/:publicId/restore", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE projects SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND team_id = ? AND archived_at IS NOT NULL`,
        )
        .run(req.params.publicId, req.user?.teamId ?? 0);
      if (result.changes === 0) throw notFound("Project not found");
      res.json({
        project: toProject(
          getProjectRow(db, req.params.publicId, req.user?.teamId ?? 0, true),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  meetingProjectsRouter.get("/:publicId/project-notes", (req, res, next) => {
    try {
      const meeting = getVisibleMeeting(
        db,
        req.params.publicId,
        req.user?.teamId ?? 0,
        req.user?.id ?? 0,
      );
      res.json({ notes: getMeetingProjectNotes(db, meeting.id) });
    } catch (error) {
      next(error);
    }
  });

  meetingProjectsRouter.post("/:publicId/project-notes", (req, res, next) => {
    try {
      const input = parseBody(req, projectNoteInputSchema);
      const note = withTransaction(db, () => {
        const meeting = getVisibleMeeting(
          db,
          req.params.publicId,
          req.user?.teamId ?? 0,
          req.user?.id ?? 0,
        );
        const projectIds = resolveProjectIds(
          db,
          input.projectPublicIds,
          req.user?.teamId ?? 0,
        );
        const maxSort = db
          .prepare(
            "SELECT COALESCE(MAX(sort_order), -1) AS value FROM meeting_note_blocks WHERE meeting_id = ?",
          )
          .get(meeting.id) as { value: number };
        const publicId = nextPublicId(db, "N");
        const inserted = db
          .prepare(
            `INSERT INTO meeting_note_blocks
             (public_id, meeting_id, body, note_type, sort_order, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .get(
            publicId,
            meeting.id,
            input.body,
            input.noteType,
            maxSort.value + 1,
            req.user?.id ?? null,
          ) as { id: number };
        for (const projectId of projectIds) {
          db.prepare(
            "INSERT INTO meeting_note_block_projects (note_block_id, project_id) VALUES (?, ?)",
          ).run(inserted.id, projectId);
          db.prepare(
            "INSERT OR IGNORE INTO meeting_projects (meeting_id, project_id) VALUES (?, ?)",
          ).run(meeting.id, projectId);
        }
        return getMeetingProjectNotes(db, meeting.id).find((item) => item.publicId === publicId);
      });
      if (!note) throw badRequest("Project note could not be created");
      res.status(201).json({ note });
    } catch (error) {
      next(error);
    }
  });

  meetingProjectsRouter.delete("/:meetingPublicId/project-notes/:notePublicId", (req, res, next) => {
    try {
      const meeting = getVisibleMeeting(
        db,
        req.params.meetingPublicId,
        req.user?.teamId ?? 0,
        req.user?.id ?? 0,
      );
      const result = db
        .prepare(
          "DELETE FROM meeting_note_blocks WHERE public_id = ? AND meeting_id = ?",
        )
        .run(req.params.notePublicId, meeting.id);
      if (result.changes === 0) throw notFound("Project note not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return { projectsRouter, meetingProjectsRouter };
}
