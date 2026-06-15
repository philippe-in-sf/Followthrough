import { Router } from "express";
import type { AppDatabase } from "../db/database.js";

type SearchResult = {
  type: "task" | "meeting" | "decision" | "person";
  publicId: string;
  title: string;
  subtitle: string;
};

const exactId = /^[A-Z][0-9]{3,}$/;

export function searchRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = req.user?.id ?? 0;
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }

    const like = `%${q}%`;
    const results: SearchResult[] = [];

    if (exactId.test(q)) {
      const exactLookups = [
        {
          type: "task",
          sql: `SELECT public_id, description AS title
                FROM tasks
                WHERE public_id = ?
                AND archived_at IS NULL
                AND (private = 0 OR created_by_user_id = ?)`,
          params: [q, userId],
        },
        {
          type: "meeting",
          sql: `SELECT public_id, title
                FROM meetings
                WHERE public_id = ?
                AND archived_at IS NULL
                AND (private = 0 OR created_by_user_id = ?)`,
          params: [q, userId],
        },
        {
          type: "decision",
          sql: `SELECT public_id, decision_text AS title
                FROM decisions
                WHERE public_id = ? AND archived_at IS NULL`,
          params: [q],
        },
        {
          type: "person",
          sql: `SELECT public_id, name AS title
                FROM people
                WHERE public_id = ? AND archived_at IS NULL`,
          params: [q],
        },
      ] as const;

      for (const lookup of exactLookups) {
        const row = db
          .prepare(lookup.sql)
          .get(...lookup.params) as { public_id: string; title: string } | undefined;

        if (row) {
          results.push({
            type: lookup.type,
            publicId: row.public_id,
            title: row.title,
            subtitle: "Exact ID match",
          });
        }
      }
    }

    const textRows: SearchResult[] = [
      ...(
        db
          .prepare(
            `SELECT public_id, description AS title
             FROM tasks
             WHERE archived_at IS NULL
             AND (private = 0 OR created_by_user_id = ?)
             AND description LIKE ?`,
          )
          .all(userId, like) as Array<{ public_id: string; title: string }>
      ).map((row) => ({
        type: "task" as const,
        publicId: row.public_id,
        title: row.title,
        subtitle: "Task",
      })),
      ...(
        db
          .prepare(
            `SELECT public_id, title
             FROM meetings
             WHERE archived_at IS NULL
             AND (private = 0 OR created_by_user_id = ?)
             AND (
               title LIKE ?
               OR summary LIKE ?
               OR notes LIKE ?
               OR EXISTS (
                 SELECT 1
                 FROM meeting_links
                 WHERE meeting_links.meeting_id = meetings.id
                 AND (meeting_links.label LIKE ? OR meeting_links.url LIKE ?)
               )
             )`,
          )
          .all(userId, like, like, like, like, like) as Array<{
          public_id: string;
          title: string;
        }>
      ).map((row) => ({
        type: "meeting" as const,
        publicId: row.public_id,
        title: row.title,
        subtitle: "Meeting",
      })),
      ...(
        db
          .prepare(
            `SELECT public_id, decision_text AS title
             FROM decisions
             WHERE archived_at IS NULL AND (decision_text LIKE ? OR context LIKE ?)`,
          )
          .all(like, like) as Array<{ public_id: string; title: string }>
      ).map((row) => ({
        type: "decision" as const,
        publicId: row.public_id,
        title: row.title,
        subtitle: "Decision",
      })),
      ...(
        db
          .prepare(
            `SELECT public_id, name AS title
             FROM people
             WHERE archived_at IS NULL AND (name LIKE ? OR email LIKE ?)`,
          )
          .all(like, like) as Array<{ public_id: string; title: string }>
      ).map((row) => ({
        type: "person" as const,
        publicId: row.public_id,
        title: row.title,
        subtitle: "Person",
      })),
    ];

    for (const row of textRows) {
      if (
        !results.some(
          (result) => result.type === row.type && result.publicId === row.publicId,
        )
      ) {
        results.push(row);
      }
    }

    res.json({ results: results.slice(0, 25) });
  });

  return router;
}
