import { Router } from "express";
import { personInputSchema, personMergeInputSchema } from "../../shared/schemas.js";
import type {
  MeetingType,
  PersonMergeResultDto,
  PersonRelatedDecisionDto,
  PersonRelatedMeetingDto,
  PersonRelatedTaskDto,
  TaskStatus,
} from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";
import { getAuditEvents, recordAuditEvent } from "../audit/auditLog.js";

type PersonRow = {
  public_id: string;
  name: string;
  email: string | null;
  archived_at: string | null;
};

type PersonWithIdRow = PersonRow & {
  id: number;
};

type RelatedTaskRow = {
  public_id: string;
  description: string;
  status: TaskStatus;
  due_date: string | null;
  private: number;
};

type RelatedMeetingRow = {
  public_id: string;
  title: string;
  starts_at: string;
  meeting_type: MeetingType;
  private: number;
};

type RelatedDecisionRow = {
  public_id: string;
  decision_text: string;
  decision_date: string;
  context: string;
  meeting_public_id: string;
};

function toPerson(row: PersonRow) {
  return {
    publicId: row.public_id,
    name: row.name,
    email: row.email,
    archived: row.archived_at !== null,
  };
}

function visibleTaskCondition() {
  return "(tasks.private = 0 OR tasks.created_by_user_id = ?)";
}

function visibleMeetingCondition() {
  return "(meetings.private = 0 OR meetings.created_by_user_id = ?)";
}

function toRelatedTask(row: RelatedTaskRow): PersonRelatedTaskDto {
  return {
    publicId: row.public_id,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    private: row.private === 1,
  };
}

function toRelatedMeeting(row: RelatedMeetingRow): PersonRelatedMeetingDto {
  return {
    publicId: row.public_id,
    title: row.title,
    startsAt: row.starts_at,
    meetingType: row.meeting_type,
    private: row.private === 1,
  };
}

function toRelatedDecision(row: RelatedDecisionRow): PersonRelatedDecisionDto {
  return {
    publicId: row.public_id,
    decisionText: row.decision_text,
    decisionDate: row.decision_date,
    context: row.context,
    meetingPublicId: row.meeting_public_id,
  };
}

export function peopleRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT public_id, name, email, archived_at
         FROM people
         WHERE archived_at IS NULL
         ORDER BY name COLLATE NOCASE`,
      )
      .all() as PersonRow[];

    res.json({ people: rows.map(toPerson) });
  });

  router.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, personInputSchema);
      const person = withTransaction(db, () => {
        const publicId = nextPublicId(db, "P");
        db.prepare("INSERT INTO people (public_id, name, email) VALUES (?, ?, ?)").run(
          publicId,
          input.name,
          input.email || null,
        );

        const created = {
          public_id: publicId,
          name: input.name,
          email: input.email || null,
          archived_at: null,
        };

        recordAuditEvent(db, {
          entityType: "person",
          entityPublicId: publicId,
          action: "created",
          userId: req.user?.id ?? null,
          summary: "Created person",
          changes: { after: toPerson(created) },
        });

        return created;
      });

      res.status(201).json({ person: toPerson(person) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId/audit", (req, res) => {
    res.json({ auditEvents: getAuditEvents(db, "person", req.params.publicId) });
  });

  router.get("/:publicId/records", (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const person = db
        .prepare(
          `SELECT public_id, name, email, archived_at
           FROM people
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .get(req.params.publicId) as PersonRow | undefined;

      if (!person) throw notFound("Person not found");

      const tasks = db
        .prepare(
          `SELECT tasks.public_id, tasks.description, tasks.status, tasks.due_date, tasks.private
           FROM tasks
           JOIN people ON people.id = tasks.assignee_person_id
           WHERE people.public_id = ?
           AND tasks.archived_at IS NULL
           AND ${visibleTaskCondition()}
           ORDER BY tasks.status = 'Done',
                    tasks.due_date IS NULL,
                    tasks.due_date ASC,
                    tasks.created_at ASC`,
        )
        .all(req.params.publicId, userId) as RelatedTaskRow[];

      const meetings = db
        .prepare(
          `SELECT meetings.public_id, meetings.title, meetings.starts_at,
                  meetings.meeting_type, meetings.private
           FROM meeting_attendees
           JOIN people ON people.id = meeting_attendees.person_id
           JOIN meetings ON meetings.id = meeting_attendees.meeting_id
           WHERE people.public_id = ?
           AND meetings.archived_at IS NULL
           AND ${visibleMeetingCondition()}
           ORDER BY meetings.starts_at DESC, meetings.public_id DESC`,
        )
        .all(req.params.publicId, userId) as RelatedMeetingRow[];

      const decisions = db
        .prepare(
          `SELECT DISTINCT decisions.public_id, decisions.decision_text,
                  decisions.decision_date, decisions.context,
                  meetings.public_id AS meeting_public_id
           FROM decisions
           JOIN meetings ON meetings.id = decisions.meeting_id
           JOIN meeting_attendees ON meeting_attendees.meeting_id = meetings.id
           JOIN people ON people.id = meeting_attendees.person_id
           WHERE people.public_id = ?
           AND decisions.archived_at IS NULL
           AND meetings.archived_at IS NULL
           AND ${visibleMeetingCondition()}
           ORDER BY decisions.decision_date DESC, decisions.created_at DESC`,
        )
        .all(req.params.publicId, userId) as RelatedDecisionRow[];

      res.json({
        person: toPerson(person),
        tasks: tasks.map(toRelatedTask),
        meetings: meetings.map(toRelatedMeeting),
        decisions: decisions.map(toRelatedDecision),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:publicId", (req, res, next) => {
    try {
      const row = db
        .prepare("SELECT public_id, name, email, archived_at FROM people WHERE public_id = ?")
        .get(req.params.publicId) as PersonRow | undefined;

      if (!row) throw notFound("Person not found");
      res.json({ person: toPerson(row) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:publicId", (req, res, next) => {
    try {
      const input = parseBody(req, personInputSchema);
      const row = withTransaction(db, () => {
        const beforeRow = db
          .prepare(
            `SELECT public_id, name, email, archived_at
             FROM people
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .get(req.params.publicId) as PersonRow | undefined;

        if (!beforeRow) throw notFound("Person not found");

        db.prepare(
          `UPDATE people
           SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        ).run(input.name, input.email || null, req.params.publicId);

        const updatedRow = db
          .prepare("SELECT public_id, name, email, archived_at FROM people WHERE public_id = ?")
          .get(req.params.publicId) as PersonRow;

        recordAuditEvent(db, {
          entityType: "person",
          entityPublicId: updatedRow.public_id,
          action: "updated",
          userId: req.user?.id ?? null,
          summary: "Updated person details",
          changes: { before: toPerson(beforeRow), after: toPerson(updatedRow) },
        });

        return updatedRow;
      });

      res.json({ person: toPerson(row) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:publicId/merge", (req, res, next) => {
    try {
      const input = parseBody(req, personMergeInputSchema);
      if (req.params.publicId === input.targetPublicId) {
        throw badRequest("Choose two different people to merge");
      }

      const result = withTransaction(db, () => {
        const source = db
          .prepare(
            `SELECT id, public_id, name, email, archived_at
             FROM people
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .get(req.params.publicId) as PersonWithIdRow | undefined;
        const target = db
          .prepare(
            `SELECT id, public_id, name, email, archived_at
             FROM people
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .get(input.targetPublicId) as PersonWithIdRow | undefined;

        if (!source) throw notFound("Source person not found");
        if (!target) throw notFound("Target person not found");

        const sourceId = source.id;
        const targetId = target.id;
        const taskResult = db
          .prepare(
            `UPDATE tasks
             SET assignee_person_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE assignee_person_id = ?`,
          )
          .run(targetId, sourceId);
        const meetingMoveCount = db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM meeting_attendees AS source_attendees
             WHERE source_attendees.person_id = ?
             AND NOT EXISTS (
               SELECT 1
               FROM meeting_attendees AS target_attendees
               WHERE target_attendees.meeting_id = source_attendees.meeting_id
               AND target_attendees.person_id = ?
             )`,
          )
          .get(sourceId, targetId) as { count: number };

        db.prepare(
          `INSERT OR IGNORE INTO meeting_attendees (meeting_id, person_id, created_at)
           SELECT meeting_id, ?, created_at
           FROM meeting_attendees
           WHERE person_id = ?`,
        ).run(targetId, sourceId);
        db.prepare("DELETE FROM meeting_attendees WHERE person_id = ?").run(sourceId);
        db.prepare(
          `UPDATE people
           SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND archived_at IS NULL`,
        ).run(sourceId);
        db.prepare(
          `UPDATE people
           SET updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND archived_at IS NULL`,
        ).run(targetId);

        const archivedSource = db
          .prepare("SELECT public_id, name, email, archived_at FROM people WHERE id = ?")
          .get(sourceId) as PersonRow;
        const updatedTarget = db
          .prepare("SELECT public_id, name, email, archived_at FROM people WHERE id = ?")
          .get(targetId) as PersonRow;
        const movedTasks = Number(taskResult.changes);
        const movedMeetingAttendances = Number(meetingMoveCount.count);

        const changes = {
          sourcePerson: toPerson(source),
          targetPerson: toPerson(target),
          movedTasks,
          movedMeetingAttendances,
        };

        recordAuditEvent(db, {
          entityType: "person",
          entityPublicId: updatedTarget.public_id,
          action: "merged_into",
          userId: req.user?.id ?? null,
          summary: `Merged person ${source.public_id} into ${target.public_id}`,
          changes,
        });
        recordAuditEvent(db, {
          entityType: "person",
          entityPublicId: archivedSource.public_id,
          action: "merged_from",
          userId: req.user?.id ?? null,
          summary: `Merged person into ${target.public_id}`,
          changes,
        });

        return {
          sourcePerson: toPerson(archivedSource),
          targetPerson: toPerson(updatedTarget),
          movedTasks,
          movedMeetingAttendances,
        } satisfies PersonMergeResultDto;
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:publicId/archive", (req, res, next) => {
    try {
      withTransaction(db, () => {
        const beforeRow = db
          .prepare(
            `SELECT public_id, name, email, archived_at
             FROM people
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .get(req.params.publicId) as PersonRow | undefined;

        if (!beforeRow) throw notFound("Person not found");

        db.prepare(
          `UPDATE people
           SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        ).run(req.params.publicId);

        recordAuditEvent(db, {
          entityType: "person",
          entityPublicId: beforeRow.public_id,
          action: "archived",
          userId: req.user?.id ?? null,
          summary: "Archived person",
          changes: { before: toPerson(beforeRow) },
        });
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
