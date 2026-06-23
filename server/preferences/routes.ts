import { Router } from "express";
import { z } from "zod";
import type { UserPreferencesDto } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";
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

  return router;
}
