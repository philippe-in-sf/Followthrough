import { Router } from "express";
import { personInputSchema } from "../../shared/schemas.js";
import type { AppDatabase } from "../db/database.js";
import { nextPublicId, withTransaction } from "../db/ids.js";
import { notFound } from "../errors.js";
import { parseBody } from "../validation.js";

type PersonRow = {
  public_id: string;
  name: string;
  email: string | null;
  archived_at: string | null;
};

function toPerson(row: PersonRow) {
  return {
    publicId: row.public_id,
    name: row.name,
    email: row.email,
    archived: row.archived_at !== null,
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

        return {
          public_id: publicId,
          name: input.name,
          email: input.email || null,
          archived_at: null,
        };
      });

      res.status(201).json({ person: toPerson(person) });
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
      const result = db
        .prepare(
          `UPDATE people
           SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .run(input.name, input.email || null, req.params.publicId);

      if (result.changes === 0) throw notFound("Person not found");

      const row = db
        .prepare("SELECT public_id, name, email, archived_at FROM people WHERE public_id = ?")
        .get(req.params.publicId) as PersonRow;

      res.json({ person: toPerson(row) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:publicId/archive", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE people
           SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE public_id = ? AND archived_at IS NULL`,
        )
        .run(req.params.publicId);

      if (result.changes === 0) throw notFound("Person not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
