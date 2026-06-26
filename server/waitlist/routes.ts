import { Router } from "express";
import { z } from "zod";
import type { AppDatabase } from "../db/database.js";
import { parseBody } from "../validation.js";

const waitlistSignupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((value) => value.toLowerCase()),
});

export function waitlistRoutes(db: AppDatabase) {
  const router = Router();

  router.post("/", (req, res, next) => {
    try {
      const input = parseBody(req, waitlistSignupSchema);
      db.prepare(
        `INSERT INTO waitlist_signups (name, email)
         VALUES (?, ?)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           updated_at = CURRENT_TIMESTAMP`,
      ).run(input.name, input.email);

      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
