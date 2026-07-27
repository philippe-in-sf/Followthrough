import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest, HttpError } from "../errors.js";
import { parseBody } from "../validation.js";
import {
  deleteCalendarFeedConnection,
  getCalendarFeedConnectionStatus,
  getCalendarFeedUrl,
  InvalidCalendarFeedUrlError,
  saveCalendarFeedConnection,
} from "./feedConnection.js";
import {
  CalendarFeedImportError,
  fetchCalendarFeed,
  parseCalendarFeedEvents,
} from "./feedImport.js";

const connectionSchema = z.object({
  feedUrl: z.string().trim().min(1).max(4096),
});

const calendarSearchSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
});

export function calendarFeedRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get("/connection", (req, res, next) => {
    try {
      res.json(getCalendarFeedConnectionStatus(db, config, req.user?.id ?? 0));
    } catch (error) {
      next(error);
    }
  });

  router.put("/connection", (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const input = parseBody(req, connectionSchema);
      saveCalendarFeedConnection(db, config, userId, input.feedUrl);
      res.json(getCalendarFeedConnectionStatus(db, config, userId));
    } catch (error) {
      if (error instanceof InvalidCalendarFeedUrlError) {
        next(badRequest(error.message));
        return;
      }
      if (
        error instanceof Error &&
        error.message.includes("CALENDAR_FEED_ENCRYPTION_KEY")
      ) {
        next(new HttpError(503, "Calendar feed encryption is not configured."));
        return;
      }
      next(error);
    }
  });

  router.delete("/connection", (req, res, next) => {
    try {
      deleteCalendarFeedConnection(db, req.user?.id ?? 0);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/events", async (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const input = calendarSearchSchema.parse(req.query);
      const feedUrl = getCalendarFeedUrl(db, config, userId);
      if (!feedUrl) {
        throw badRequest("Add an iCalendar feed before importing events.");
      }

      const source = await fetchCalendarFeed(feedUrl);
      res.json({ events: parseCalendarFeedEvents(source, input.query) });
    } catch (error) {
      if (error instanceof CalendarFeedImportError) {
        next(badRequest(error.message));
        return;
      }
      if (
        error instanceof Error &&
        error.message.includes("CALENDAR_FEED_ENCRYPTION_KEY")
      ) {
        next(new HttpError(503, "Calendar feed encryption is not configured."));
        return;
      }
      next(error);
    }
  });

  return router;
}
