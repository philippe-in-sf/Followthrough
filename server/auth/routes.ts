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
  getAuthUserById,
  getSessionUser,
  type AuthUser,
  type UserRole,
} from "./sessions.js";
import { getDefaultTeamId, insertUserWithPasswordHash } from "./userManagement.js";

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

function userDto(row: AuthUser) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    team: {
      id: row.teamId,
      name: row.teamName,
      logoUrl: row.teamLogoUrl,
      workCalendarUrl: row.teamWorkCalendarUrl,
    },
  };
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
            `SELECT id, usage_limit, usage_count, team_id, default_role
             FROM invite_codes
             WHERE code = ? AND active = 1`,
          )
          .get(input.inviteCode) as
          | {
              id: number;
              usage_limit: number | null;
              usage_count: number;
              team_id: number | null;
              default_role: UserRole | null;
            }
          | undefined;

        if (!invite || (invite.usage_limit !== null && invite.usage_count >= invite.usage_limit)) {
          throw badRequest("Invite code is invalid");
        }

        const createdUser = insertUserWithPasswordHash(db, {
          name: input.name,
          email: input.email,
          passwordHash,
          teamId: invite.team_id ?? getDefaultTeamId(db),
          role: invite.default_role ?? "member",
        });

        db.prepare("UPDATE invite_codes SET usage_count = usage_count + 1 WHERE id = ?").run(
          invite.id,
        );

        return createdUser;
      });

      createSession(db, res, user.id, config);
      res.status(201).json({ user: userDto(user) });
    } catch (error) {
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
      const authUser = getAuthUserById(db, user.id);
      if (!authUser) throw badRequest("Email or password is incorrect");
      res.json({ user: userDto(authUser) });
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
