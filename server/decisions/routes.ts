import { Router } from "express";
import type { z } from "zod";
import { decisionInputSchema } from "../../shared/schemas.js";
import type { DecisionDto } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { getAuditEvents } from "../audit/auditLog.js";
import { badRequest, notFound } from "../errors.js";
import { createTaskRecord } from "../tasks/routes.js";
import { mapTaskRows, taskSelect, type TaskRow } from "../tasks/taskRows.js";
import { parseBody } from "../validation.js";

type DecisionInput = z.infer<typeof decisionInputSchema>;

type DecisionRow = {
  public_id: string;
  decision_text: string;
  decision_date: string;
  context: string;
  meeting_public_id: string | null;
  archived_at: string | null;
};

function getDecisionTasks(
  db: AppDatabase,
  config: AppConfig,
  decisionPublicId: string,
  userId: number,
  teamId: number,
) {
  const rows = db
    .prepare(
      `${taskSelect}
       WHERE origin_decisions.public_id = ?
       AND tasks.team_id = ?
       AND (tasks.private = 0 OR tasks.created_by_user_id = ?)
       AND tasks.archived_at IS NULL
       ORDER BY tasks.status = 'Done', tasks.due_date IS NULL, tasks.due_date ASC, tasks.created_at ASC`,
    )
    .all(decisionPublicId, teamId, userId) as TaskRow[];

  return mapTaskRows(db, config, rows, userId);
}

function toDecision(
  db: AppDatabase,
  config: AppConfig,
  row: DecisionRow,
  userId: number,
  teamId: number,
): DecisionDto {
  return {
    publicId: row.public_id,
    decisionText: row.decision_text,
    decisionDate: row.decision_date,
    context: row.context,
    meetingPublicId: row.meeting_public_id,
    tasks: getDecisionTasks(db, config, row.public_id, userId, teamId),
    archived: row.archived_at !== null,
  };
}

function decisionSelect() {
  return `
    SELECT decisions.public_id, decisions.decision_text, decisions.decision_date,
           decisions.context, meetings.public_id AS meeting_public_id,
           decisions.archived_at
    FROM decisions
    LEFT JOIN meetings ON meetings.id = decisions.meeting_id
  `;
}

function getDecisionByPublicId(
  db: AppDatabase,
  config: AppConfig,
  publicId: string,
  userId: number,
  teamId: number,
  includeArchived = false,
) {
  const row = db
    .prepare(
      `${decisionSelect()}
       WHERE decisions.public_id = ?
       AND decisions.team_id = ?
       ${includeArchived ? "" : "AND decisions.archived_at IS NULL"}`,
    )
    .get(publicId, teamId) as DecisionRow | undefined;

  if (!row) throw notFound("Decision not found");
  return toDecision(db, config, row, userId, teamId);
}

function resolveMeetingId(db: AppDatabase, teamId: number, meetingPublicId?: string | null) {
  if (!meetingPublicId) return null;

  const meeting = db
    .prepare("SELECT id FROM meetings WHERE public_id = ? AND team_id = ? AND archived_at IS NULL")
    .get(meetingPublicId, teamId) as { id: number } | undefined;

  if (!meeting) throw badRequest("Meeting not found");
  return meeting.id;
}

function createFollowUpTaskFromDecision(
  db: AppDatabase,
  config: AppConfig,
  followUpTask: DecisionInput["followUpTask"],
  decisionPublicId: string,
  meetingPublicId: string | null | undefined,
  userId: number,
  teamId: number,
) {
  if (!followUpTask) return;

  createTaskRecord(
    db,
    config,
    {
      description: followUpTask.description,
      blockers: followUpTask.blockers,
      notes: followUpTask.notes,
      blockersCleared: false,
      assigneePublicId: followUpTask.assigneePublicId ?? null,
      status: followUpTask.status,
      dueDate: followUpTask.dueDate ?? null,
      originMeetingPublicId: meetingPublicId ?? null,
      originDecisionPublicId: decisionPublicId,
      seriesPublicId: null,
      reminderMode: "manual",
      dependencyPublicIds: [],
      private: followUpTask.private,
    },
    { userId, teamId },
  );
}

export function decisionRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get("/", (req, res) => {
    const rows = db
      .prepare(
        `${decisionSelect()}
         WHERE decisions.team_id = ?
         AND decisions.archived_at IS NULL
         ORDER BY decisions.decision_date DESC, decisions.created_at DESC`,
      )
      .all(req.user?.teamId ?? 0) as DecisionRow[];

    const userId = req.user?.id ?? 0;
    const teamId = req.user?.teamId ?? 0;
    res.json({
      decisions: rows.map((row) => toDecision(db, config, row, userId, teamId)),
    });
  });

  router.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, decisionInputSchema);
      const decision = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const teamId = req.user?.teamId ?? 0;
        const meetingId = resolveMeetingId(db, teamId, input.meetingPublicId);
        const publicId = nextPublicId(db, "D");
        db.prepare(
          `INSERT INTO decisions (public_id, decision_text, decision_date, context, meeting_id, team_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(publicId, input.decisionText, input.decisionDate, input.context, meetingId, teamId);
        createFollowUpTaskFromDecision(
          db,
          config,
          input.followUpTask,
          publicId,
          input.meetingPublicId,
          userId,
          teamId,
        );

        return getDecisionByPublicId(db, config, publicId, userId, teamId);
      });

      res.status(201).json({ decision });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId", (req, res, next) => {
    try {
      res.json({
        decision: getDecisionByPublicId(
          db,
          config,
          req.params.publicId,
          req.user?.id ?? 0,
          req.user?.teamId ?? 0,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, decisionInputSchema);
      const decision = withTransaction(db, () => {
        const userId = req.user?.id ?? 0;
        const teamId = req.user?.teamId ?? 0;
        const meetingId = resolveMeetingId(db, teamId, input.meetingPublicId);
        const result = db
          .prepare(
            `UPDATE decisions
             SET decision_text = ?, decision_date = ?, context = ?,
                 meeting_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ? AND team_id = ? AND archived_at IS NULL`,
          )
          .run(
            input.decisionText,
            input.decisionDate,
            input.context,
            meetingId,
            req.params.publicId,
            teamId,
          );

        if (result.changes === 0) throw notFound("Decision not found");
        createFollowUpTaskFromDecision(
          db,
          config,
          input.followUpTask,
          req.params.publicId,
          input.meetingPublicId,
          userId,
          teamId,
        );
        return getDecisionByPublicId(db, config, req.params.publicId, userId, teamId);
      });

      res.json({ decision });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId/audit", (req, res, next) => {
    try {
      getDecisionByPublicId(
        db,
        config,
        req.params.publicId,
        req.user?.id ?? 0,
        req.user?.teamId ?? 0,
        true,
      );
      res.json({ auditEvents: getAuditEvents(db, "decision", req.params.publicId) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:publicId/archive", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE decisions
           SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND team_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId, req.user?.teamId ?? 0);

      if (result.changes === 0) throw notFound("Decision not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
