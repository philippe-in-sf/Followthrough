import { Router } from "express";
import { decisionInputSchema } from "../../shared/schemas.js";
import type { DecisionDto } from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";

type DecisionRow = {
  public_id: string;
  decision_text: string;
  decision_date: string;
  context: string;
  meeting_public_id: string | null;
  archived_at: string | null;
};

function toDecision(row: DecisionRow): DecisionDto {
  return {
    publicId: row.public_id,
    decisionText: row.decision_text,
    decisionDate: row.decision_date,
    context: row.context,
    meetingPublicId: row.meeting_public_id,
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

function getDecisionByPublicId(db: AppDatabase, publicId: string, includeArchived = false) {
  const row = db
    .prepare(
      `${decisionSelect()}
       WHERE decisions.public_id = ? ${includeArchived ? "" : "AND decisions.archived_at IS NULL"}`,
    )
    .get(publicId) as DecisionRow | undefined;

  if (!row) throw notFound("Decision not found");
  return toDecision(row);
}

function resolveMeetingId(db: AppDatabase, meetingPublicId?: string | null) {
  if (!meetingPublicId) return null;

  const meeting = db
    .prepare("SELECT id FROM meetings WHERE public_id = ? AND archived_at IS NULL")
    .get(meetingPublicId) as { id: number } | undefined;

  if (!meeting) throw badRequest("Meeting not found");
  return meeting.id;
}

export function decisionRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/", (_req, res) => {
    const rows = db
      .prepare(
        `${decisionSelect()}
         WHERE decisions.archived_at IS NULL
         ORDER BY decisions.decision_date DESC, decisions.created_at DESC`,
      )
      .all() as DecisionRow[];

    res.json({ decisions: rows.map(toDecision) });
  });

  router.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, decisionInputSchema);
      const decision = withTransaction(db, () => {
        const meetingId = resolveMeetingId(db, input.meetingPublicId);
        const publicId = nextPublicId(db, "D");
        db.prepare(
          `INSERT INTO decisions (public_id, decision_text, decision_date, context, meeting_id)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(publicId, input.decisionText, input.decisionDate, input.context, meetingId);

        return getDecisionByPublicId(db, publicId);
      });

      res.status(201).json({ decision });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId", (req, res, next) => {
    try {
      res.json({ decision: getDecisionByPublicId(db, req.params.publicId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, decisionInputSchema);
      const decision = withTransaction(db, () => {
        const meetingId = resolveMeetingId(db, input.meetingPublicId);
        const result = db
          .prepare(
            `UPDATE decisions
             SET decision_text = ?, decision_date = ?, context = ?,
                 meeting_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .run(
            input.decisionText,
            input.decisionDate,
            input.context,
            meetingId,
            req.params.publicId,
          );

        if (result.changes === 0) throw notFound("Decision not found");
        return getDecisionByPublicId(db, req.params.publicId);
      });

      res.json({ decision });
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
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId);

      if (result.changes === 0) throw notFound("Decision not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
