import { Router } from "express";
import { z } from "zod";
import type { GoogleCalendarImportEventDto, MeetingLinkType } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";
import {
  buildGoogleAuthorizationUrl,
  consumeGoogleOAuthState,
  createGoogleOAuthState,
  deleteGoogleCalendarConnection,
  exchangeGoogleOAuthCode,
  fetchGoogleUserEmail,
  getGoogleCalendarAccessToken,
  saveGoogleCalendarConnection,
} from "./oauth.js";

const calendarSearchSchema = z.object({
  query: z.string().trim().optional().default(""),
});

const oauthCallbackSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

type GoogleCalendarEvent = {
  id?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  attendees?: Array<{
    displayName?: string;
    email?: string;
  }>;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
};

function addLink(
  links: GoogleCalendarImportEventDto["links"],
  seenUrls: Set<string>,
  label: string,
  url: string | undefined,
  linkType: MeetingLinkType,
) {
  if (!url || seenUrls.has(url)) return;
  seenUrls.add(url);
  links.push({ label, url, linkType });
}

function mapGoogleEvent(event: GoogleCalendarEvent): GoogleCalendarImportEventDto | null {
  const rawStart = event.start?.dateTime ?? event.start?.date;
  if (!rawStart) return null;

  const startsAt = new Date(rawStart).toISOString();
  const attendeeNames =
    event.attendees
      ?.map((attendee) => attendee.displayName?.trim() || attendee.email?.trim() || "")
      .filter(Boolean)
      .join(", ") ?? "";
  const links: GoogleCalendarImportEventDto["links"] = [];
  const seenUrls = new Set<string>();

  addLink(links, seenUrls, "Google Calendar event", event.htmlLink, "reference");
  addLink(links, seenUrls, "Google Meet", event.hangoutLink, "work");
  for (const entryPoint of event.conferenceData?.entryPoints ?? []) {
    if (entryPoint.entryPointType === "video") {
      addLink(links, seenUrls, "Google Meet", entryPoint.uri, "work");
    }
  }

  return {
    id: event.id ?? startsAt,
    title: event.summary?.trim() || "Untitled Google Calendar event",
    startsAt,
    summary: event.location?.trim() ?? "",
    notes: event.description ?? "",
    attendeeNames,
    links,
  };
}

export function googleCalendarRoutes(db: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get("/connect", (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const state = createGoogleOAuthState(db, userId);
      res.redirect(buildGoogleAuthorizationUrl(config, state, req.user?.email));
    } catch (error) {
      next(error);
    }
  });

  router.get("/oauth/callback", async (req, res, next) => {
    try {
      const userId = req.user?.id ?? 0;
      const input = oauthCallbackSchema.parse(req.query);
      if (!consumeGoogleOAuthState(db, userId, input.state)) {
        throw badRequest("Google Calendar connection could not be verified.");
      }

      const token = await exchangeGoogleOAuthCode(config, input.code);
      const googleEmail = await fetchGoogleUserEmail(token.access_token ?? "");
      saveGoogleCalendarConnection(db, {
        userId,
        googleEmail,
        accessToken: token.access_token ?? "",
        refreshToken: token.refresh_token ?? null,
        expiresInSeconds: token.expires_in ?? 3600,
        scope: token.scope ?? "",
      });

      res.redirect("/?googleCalendar=connected");
    } catch (error) {
      next(error);
    }
  });

  router.delete("/connection", (req, res, next) => {
    try {
      deleteGoogleCalendarConnection(db, req.user?.id ?? 0);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/events", async (req, res, next) => {
    try {
      const input = calendarSearchSchema.parse(req.query);
      const accessToken = await getGoogleCalendarAccessToken(db, config, req.user?.id ?? 0);
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "10");
      url.searchParams.set("timeMin", new Date().toISOString());
      if (input.query) url.searchParams.set("q", input.query);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw badRequest("Google Calendar could not be searched");
      }

      const body = (await response.json()) as { items?: GoogleCalendarEvent[] };
      const events = (body.items ?? []).map(mapGoogleEvent).filter((event) => event !== null);

      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
