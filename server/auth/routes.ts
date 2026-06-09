import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { withTransaction } from "../db/ids.js";
import { badRequest } from "../errors.js";
import { parseBody } from "../validation.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionUser,
} from "./sessions.js";

const signupSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12),
  inviteCode: z.string().trim().min(1),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

function userDto(row: { id: number; name: string; email: string }) {
  return { id: row.id, name: row.name, email: row.email };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unique constraint failed")
  );
}

export function authRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.post("/signup", async (req, res, next) => {
    try {
      const input = parseBody(req, signupSchema);
      const passwordHash = await hashPassword(input.password);

      const user = withTransaction(db, () => {
        const invite = db
          .prepare(
            `SELECT id, usage_limit, usage_count
             FROM invite_codes
             WHERE code = ? AND active = 1`,
          )
          .get(input.inviteCode) as
          | { id: number; usage_limit: number | null; usage_count: number }
          | undefined;

        if (!invite || (invite.usage_limit !== null && invite.usage_count >= invite.usage_limit)) {
          throw badRequest("Invite code is invalid");
        }

        const result = db
          .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
          .run(input.name, input.email, passwordHash);

        db.prepare("UPDATE invite_codes SET usage_count = usage_count + 1 WHERE id = ?").run(
          invite.id,
        );

        const createdUser = {
          id: Number(result.lastInsertRowid),
          name: input.name,
          email: input.email,
        };
        createSession(db, res, createdUser.id, config);
        return createdUser;
      });

      res.status(201).json({ user: userDto(user) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        next(badRequest("A user with that email already exists"));
        return;
      }
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const input = parseBody(req, loginSchema);
      const user = db
        .prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?")
        .get(input.email) as
        | { id: number; name: string; email: string; password_hash: string }
        | undefined;

      if (!user || !(await verifyPassword(input.password, user.password_hash))) {
        throw badRequest("Email or password is incorrect");
      }

      createSession(db, res, user.id, config);
      res.json({ user: userDto(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (req, res) => {
    destroySession(db, req.headers.cookie, config);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get("/me", (req, res) => {
    const user = getSessionUser(db, req.headers.cookie, config);
    res.json({ user: user ? userDto(user) : null });
  });

  return router;
}
