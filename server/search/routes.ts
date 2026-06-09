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
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }

    const like = `%${q}%`;
    const results: SearchResult[] = [];

    if (exactId.test(q)) {
      const exactLookups = [
        ["task", "tasks", "description"],
        ["meeting", "meetings", "title"],
        ["decision", "decisions", "decision_text"],
        ["person", "people", "name"],
      ] as const;

      for (const [type, table, titleColumn] of exactLookups) {
        const row = db
          .prepare(
            `SELECT public_id, ${titleColumn} AS title
             FROM ${table}
             WHERE public_id = ? AND archived_at IS NULL`,
          )
          .get(q) as { public_id: string; title: string } | undefined;

        if (row) {
          results.push({
            type,
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
            "SELECT public_id, description AS title FROM tasks WHERE archived_at IS NULL AND description LIKE ?",
          )
          .all(like) as Array<{ public_id: string; title: string }>
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
             WHERE archived_at IS NULL AND (title LIKE ? OR summary LIKE ?)`,
          )
          .all(like, like) as Array<{ public_id: string; title: string }>
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
