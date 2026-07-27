import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import {
  expandRecurringEvent,
  sync as ical,
  type Attendee,
  type ParameterValue,
  type VEvent,
} from "node-ical";
import type { CalendarImportEventDto, MeetingLinkType } from "../../shared/types.js";

const FEED_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_RESULTS = 10;
const SEARCH_HORIZON_DAYS = 366;

export class CalendarFeedImportError extends Error {}

function isUnsafeIpAddress(rawAddress: string) {
  try {
    let address = ipaddr.parse(rawAddress.replace(/^\[|\]$/g, ""));
    if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) {
      address = address.toIPv4Address();
    }
    return address.range() !== "unicast";
  } catch {
    return true;
  }
}

async function assertPublicFeedTarget(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new CalendarFeedImportError(
      "Calendar feed redirects must use a public https URL.",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isUnsafeIpAddress(address))
  ) {
    throw new CalendarFeedImportError(
      "Calendar feed URL must resolve to a public internet address.",
    );
  }
}

async function readLimitedResponse(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FEED_BYTES) {
    throw new CalendarFeedImportError("Calendar feed is too large to import.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new CalendarFeedImportError("Calendar feed is too large to import.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchCalendarFeed(feedUrl: string) {
  let currentUrl = new URL(feedUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    try {
      await assertPublicFeedTarget(currentUrl);
    } catch (error) {
      if (error instanceof CalendarFeedImportError) throw error;
      throw new CalendarFeedImportError("Calendar feed host could not be resolved.");
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: {
          Accept: "text/calendar, text/plain;q=0.9",
          "User-Agent": "Followthrough calendar importer",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });
    } catch {
      throw new CalendarFeedImportError("Calendar feed could not be reached.");
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new CalendarFeedImportError("Calendar feed redirected too many times.");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new CalendarFeedImportError("Calendar feed could not be loaded.");
    }
    return readLimitedResponse(response);
  }

  throw new CalendarFeedImportError("Calendar feed redirected too many times.");
}

function textValue(value: ParameterValue | undefined) {
  if (!value) return "";
  return typeof value === "string" ? value : value.val;
}

function attendeeName(attendee: Attendee) {
  if (typeof attendee === "string") {
    return attendee.replace(/^mailto:/i, "").trim();
  }
  return (
    attendee.params.CN?.trim() ||
    attendee.val.replace(/^mailto:/i, "").trim()
  );
}

function addLink(
  links: CalendarImportEventDto["links"],
  seenUrls: Set<string>,
  label: string,
  rawUrl: string,
  linkType: MeetingLinkType,
) {
  const candidate = rawUrl.replace(/[),.;]+$/, "");
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      seenUrls.has(url.toString())
    ) {
      return;
    }
    seenUrls.add(url.toString());
    links.push({ label, url: url.toString(), linkType });
  } catch {
    // Ignore malformed links embedded in otherwise valid calendar text.
  }
}

function linkMetadata(url: string) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname === "meet.google.com") {
    return { label: "Google Meet", linkType: "work" as const };
  }
  if (hostname.endsWith("zoom.us")) {
    return { label: "Zoom meeting", linkType: "work" as const };
  }
  if (hostname === "teams.microsoft.com" || hostname === "teams.live.com") {
    return { label: "Microsoft Teams", linkType: "work" as const };
  }
  return { label: "Calendar link", linkType: "reference" as const };
}

function eventLinks(event: VEvent) {
  const links: CalendarImportEventDto["links"] = [];
  const seenUrls = new Set<string>();

  if (event.url) {
    addLink(links, seenUrls, "Calendar event", event.url, "reference");
  }

  const searchableText = [
    textValue(event.description),
    textValue(event.location),
  ].join("\n");
  for (const match of searchableText.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    const metadata = linkMetadata(match[0].replace(/[),.;]+$/, ""));
    addLink(links, seenUrls, metadata.label, match[0], metadata.linkType);
  }
  return links;
}

function eventInstances(event: VEvent, from: Date, to: Date) {
  if (event.rrule) {
    return expandRecurringEvent(event, {
      from,
      to,
      includeOverrides: true,
      excludeExdates: true,
    });
  }
  if (event.start < from || event.start > to) return [];
  return [
    {
      start: event.start,
      event,
    },
  ];
}

export function parseCalendarFeedEvents(
  source: string,
  query: string,
  now = new Date(),
): CalendarImportEventDto[] {
  if (!source.includes("BEGIN:VCALENDAR")) {
    throw new CalendarFeedImportError("Calendar feed did not contain iCalendar data.");
  }

  let parsed: ReturnType<typeof ical.parseICS>;
  try {
    parsed = ical.parseICS(source);
  } catch {
    throw new CalendarFeedImportError("Calendar feed could not be parsed.");
  }

  const horizon = new Date(now.getTime() + SEARCH_HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const candidates: CalendarImportEventDto[] = [];
  const seenIds = new Set<string>();

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT" || component.status === "CANCELLED") {
      continue;
    }

    let instances: ReturnType<typeof eventInstances>;
    try {
      instances = eventInstances(component, now, horizon);
    } catch {
      continue;
    }

    for (const instance of instances) {
      const event = instance.event;
      if (event.status === "CANCELLED") continue;

      const title = textValue(event.summary).trim() || "Untitled calendar event";
      const notes = textValue(event.description);
      const summary = textValue(event.location).trim();
      const attendees = Array.isArray(event.attendee)
        ? event.attendee
        : event.attendee
          ? [event.attendee]
          : [];
      const attendeeNames = attendees.map(attendeeName).filter(Boolean).join(", ");
      const startsAt = instance.start.toISOString();
      const id = `${event.uid}:${startsAt}`;
      const searchable = [title, notes, summary, attendeeNames].join("\n").toLocaleLowerCase();
      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
      if (seenIds.has(id)) continue;

      seenIds.add(id);
      candidates.push({
        id,
        title,
        startsAt,
        summary,
        notes,
        attendeeNames,
        links: eventLinks(event),
      });
    }
  }

  return candidates
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, MAX_RESULTS);
}
