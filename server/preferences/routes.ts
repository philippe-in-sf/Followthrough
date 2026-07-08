import { Router } from "express";
import { z } from "zod";
import type { UserPreferencesDto } from "../../shared/types.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";
import { authUserDto } from "../auth/sessions.js";
import { moveUserToPersonalTeam } from "../auth/teamMembership.js";
import { getGoogleCalendarConnectionStatus } from "../calendar/oauth.js";
import { parseBody } from "../validation.js";
import {
  InvalidWorkCalendarUrlError,
  getUserPreferences,
  upsertUserPreferences,
  type UserPreferences,
} from "./store.js";

const preferencesSchema = z.object({
  workCalendarUrl: z.string().nullable(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

function toUserPreferencesDto(
  preferences: UserPreferences,
  db: AppDatabase,
  config: AppConfig,
): UserPreferencesDto {
  const googleCalendar = getGoogleCalendarConnectionStatus(db, config, preferences.userId);
  return {
    workCalendarUrl: preferences.workCalendarUrl,
    ...googleCalendar,
  };
}

export function preferenceRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get("/preferences", (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      res.json(toUserPreferencesDto(getUserPreferences(db, userId), db, config));
    } catch (error) {
      next(error);
    }
  });

  router.put("/preferences", (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const input = parseBody(req, preferencesSchema);
      const preferences = upsertUserPreferences(db, {
        userId,
        workCalendarUrl: input.workCalendarUrl,
      });
      res.json(toUserPreferencesDto(preferences, db, config));
    } catch (error) {
      if (error instanceof InvalidWorkCalendarUrlError) {
        next(badRequest(error.message));
        return;
      }
      next(error);
    }
  });

  router.post("/password", async (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const input = parseBody(req, passwordSchema);
      const row = db
        .prepare("SELECT password_hash FROM users WHERE id = ?")
        .get(userId) as { password_hash: string } | undefined;

      if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
        throw badRequest("Current password is incorrect");
      }

      const passwordHash = await hashPassword(input.newPassword);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/team/leave", (req, res, next) => {
    try {
      const user = moveUserToPersonalTeam(db, req.user?.id ?? 0);
      res.json({ user: authUserDto(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
