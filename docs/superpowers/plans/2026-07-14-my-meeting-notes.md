# My Meeting Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Notes section that lets the signed-in user view meeting notes from meetings they created or attended across day, week, month, and custom date ranges.

**Architecture:** Add a protected `/api/me/meeting-notes` endpoint that computes date windows, finds meetings scoped to the current user's team, and matches by `created_by_user_id` or attendee People email. Add a typed client method and a `MeetingNotesPage` wired into the existing shell navigation and meeting focus flow.

**Tech Stack:** Express 5, SQLite via better-sqlite3 style prepared statements, Zod, React 19, TypeScript, Vitest, Supertest, Testing Library.

---

## File Structure

- Create `server/notes/routes.ts`: protected notes endpoint, query parsing, SQL, DTO mapping.
- Modify `server/app.ts`: mount `notesRoutes` under protected `/api/me`.
- Modify `shared/types.ts`: add `MeetingNoteDto` and `MeetingNoteMatchReason`.
- Modify `src/api/client.ts`: add response types and `api.meetingNotes.list`.
- Create `src/features/notes/MeetingNotesPage.tsx`: range controls and note list.
- Modify `src/components/shellNavigation.tsx`: add `Notes` navigation entry.
- Modify `src/App.tsx`: render Notes page and allow opening meetings from notes.
- Modify `src/styles.css`: add restrained Notes page styles.
- Create `tests/server/meeting-notes.test.ts`: backend behavior and visibility tests.
- Create `tests/client/meeting-notes.test.tsx`: page-level interaction tests.

## Task 1: Backend Endpoint

**Files:**
- Create: `server/notes/routes.ts`
- Modify: `server/app.ts`
- Modify: `shared/types.ts`
- Test: `tests/server/meeting-notes.test.ts`

- [ ] **Step 1: Write the failing server tests**

Create `tests/server/meeting-notes.test.ts` with tests for created meetings, attendee-email matches, deduplication, date range filtering, and exclusions:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { createUser } from "../../server/auth/userManagement";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

async function setup() {
  const db = createTestDatabase();
  dbs.push(db);
  migrateDatabase(db);
  const app = createApp({ db });

  await createUser(db, {
    name: "Editor",
    email: "editor@example.com",
    password: "long-enough-password",
    role: "admin",
    teamId: 1,
  });
  await createUser(db, {
    name: "Teammate",
    email: "teammate@example.com",
    password: "long-enough-password",
    role: "member",
    teamId: 1,
  });

  const editorLogin = await request(app).post("/api/auth/login").send({
    email: "editor@example.com",
    password: "long-enough-password",
  });
  const teammateLogin = await request(app).post("/api/auth/login").send({
    email: "teammate@example.com",
    password: "long-enough-password",
  });

  const editorPerson = await request(app)
    .post("/api/people")
    .set("Cookie", editorLogin.headers["set-cookie"])
    .send({ name: "Editor Person", email: "editor@example.com" });
  const teammatePerson = await request(app)
    .post("/api/people")
    .set("Cookie", editorLogin.headers["set-cookie"])
    .send({ name: "Teammate Person", email: "teammate@example.com" });

  return {
    app,
    db,
    editorCookie: editorLogin.headers["set-cookie"],
    teammateCookie: teammateLogin.headers["set-cookie"],
    editorPersonPublicId: editorPerson.body.person.publicId as string,
    teammatePersonPublicId: teammatePerson.body.person.publicId as string,
  };
}

async function createMeeting(
  app: ReturnType<typeof createApp>,
  cookie: string[],
  body: {
    title: string;
    startsAt: string;
    notes: string;
    attendeePublicIds?: string[];
    private?: boolean;
  },
) {
  return request(app)
    .post("/api/meetings")
    .set("Cookie", cookie)
    .send({
      title: body.title,
      startsAt: body.startsAt,
      meetingType: "single",
      summary: "",
      notes: body.notes,
      attendeePublicIds: body.attendeePublicIds ?? [],
      taskPublicIds: [],
      private: body.private ?? false,
    });
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("meeting notes", () => {
  it("lists notes from meetings created by or attended by the signed-in user", async () => {
    const { app, editorCookie, teammateCookie, editorPersonPublicId, teammatePersonPublicId } =
      await setup();

    await createMeeting(app, editorCookie, {
      title: "Created by editor",
      startsAt: "2026-07-13T15:00:00.000Z",
      notes: "Created note",
      attendeePublicIds: [teammatePersonPublicId],
    });
    await createMeeting(app, teammateCookie, {
      title: "Editor attended",
      startsAt: "2026-07-12T15:00:00.000Z",
      notes: "Attended note",
      attendeePublicIds: [editorPersonPublicId],
    });
    await createMeeting(app, teammateCookie, {
      title: "Both match once",
      startsAt: "2026-07-11T15:00:00.000Z",
      notes: "Both note",
      attendeePublicIds: [editorPersonPublicId],
    });

    const response = await request(app)
      .get("/api/me/meeting-notes?range=week")
      .set("Cookie", editorCookie);

    expect(response.status).toBe(200);
    expect(response.body.notes.map((note: { title: string }) => note.title)).toEqual([
      "Created by editor",
      "Editor attended",
      "Both match once",
    ]);
    expect(response.body.notes[0]).toEqual(
      expect.objectContaining({
        publicId: "M001",
        notes: "Created note",
        matchReasons: ["creator"],
      }),
    );
    expect(response.body.notes[1].matchReasons).toEqual(["attendee"]);
  });

  it("filters by preset and custom date ranges", async () => {
    const { app, editorCookie } = await setup();

    await createMeeting(app, editorCookie, {
      title: "Recent",
      startsAt: "2026-07-13T15:00:00.000Z",
      notes: "Recent note",
    });
    await createMeeting(app, editorCookie, {
      title: "Older",
      startsAt: "2026-06-01T15:00:00.000Z",
      notes: "Older note",
    });

    const day = await request(app)
      .get("/api/me/meeting-notes?range=day&now=2026-07-14T00:00:00.000Z")
      .set("Cookie", editorCookie);
    expect(day.body.notes.map((note: { title: string }) => note.title)).toEqual(["Recent"]);

    const custom = await request(app)
      .get("/api/me/meeting-notes?range=custom&startDate=2026-06-01&endDate=2026-06-30")
      .set("Cookie", editorCookie);
    expect(custom.body.notes.map((note: { title: string }) => note.title)).toEqual(["Older"]);
  });

  it("excludes archived meetings, blank notes, other-team records, and inaccessible private notes", async () => {
    const { app, db, editorCookie, teammateCookie } = await setup();
    db.prepare("INSERT INTO teams (id, name) VALUES (?, ?)").run(2, "Other Team");
    await createUser(db, {
      name: "Other Team",
      email: "other@example.com",
      password: "long-enough-password",
      role: "admin",
      teamId: 2,
    });
    const otherLogin = await request(app).post("/api/auth/login").send({
      email: "other@example.com",
      password: "long-enough-password",
    });

    await createMeeting(app, editorCookie, {
      title: "Visible",
      startsAt: "2026-07-13T15:00:00.000Z",
      notes: "Visible note",
    });
    await createMeeting(app, editorCookie, {
      title: "Blank",
      startsAt: "2026-07-13T14:00:00.000Z",
      notes: "   ",
    });
    await createMeeting(app, teammateCookie, {
      title: "Private teammate",
      startsAt: "2026-07-13T13:00:00.000Z",
      notes: "Private note",
      private: true,
    });
    await createMeeting(app, otherLogin.headers["set-cookie"], {
      title: "Other team",
      startsAt: "2026-07-13T12:00:00.000Z",
      notes: "Other team note",
    });
    await request(app).post("/api/meetings/M001/archive").set("Cookie", editorCookie);

    const response = await request(app)
      .get("/api/me/meeting-notes?range=month")
      .set("Cookie", editorCookie);

    expect(response.body.notes).toEqual([]);
  });

  it("rejects invalid custom date ranges", async () => {
    const { app, editorCookie } = await setup();

    const response = await request(app)
      .get("/api/me/meeting-notes?range=custom&startDate=2026-07-31&endDate=2026-07-01")
      .set("Cookie", editorCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Start date must be before end date");
  });
});
```

- [ ] **Step 2: Run the server test to verify RED**

Run: `npm run test -- tests/server/meeting-notes.test.ts`

Expected: FAIL because `GET /api/me/meeting-notes` does not exist or returns 404.

- [ ] **Step 3: Add shared response types**

In `shared/types.ts`, add:

```ts
export type MeetingNoteMatchReason = "creator" | "attendee";

export type MeetingNoteDto = {
  publicId: string;
  title: string;
  startsAt: string;
  notes: string;
  attendees: PersonDto[];
  matchReasons: MeetingNoteMatchReason[];
};
```

- [ ] **Step 4: Implement `server/notes/routes.ts`**

Create `server/notes/routes.ts`:

```ts
import { Router } from "express";
import type {
  MeetingNoteDto,
  MeetingNoteMatchReason,
  PersonDto,
} from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";

type MeetingNoteRow = {
  id: number;
  public_id: string;
  title: string;
  starts_at: string;
  notes: string;
  created_by_user_id: number | null;
  is_attendee: number;
};

type PersonRow = {
  public_id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string | null;
  archived_at: string | null;
};

function parseDate(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} must be YYYY-MM-DD`);
  }
  return value;
}

function dateStart(value: string) {
  return `${value}T00:00:00.000Z`;
}

function dateEnd(value: string) {
  return `${value}T23:59:59.999Z`;
}

function startFromPreset(range: string, now: Date) {
  const start = new Date(now);
  if (range === "day") start.setUTCDate(start.getUTCDate() - 1);
  else if (range === "week") start.setUTCDate(start.getUTCDate() - 7);
  else if (range === "month") start.setUTCMonth(start.getUTCMonth() - 1);
  else throw badRequest("Range must be day, week, month, or custom");
  return start.toISOString();
}

function resolveWindow(query: Record<string, unknown>) {
  const range = typeof query.range === "string" ? query.range : "week";
  if (range === "custom") {
    const startDate = parseDate(query.startDate, "Start date");
    const endDate = parseDate(query.endDate, "End date");
    if (startDate > endDate) throw badRequest("Start date must be before end date");
    return { range, startAt: dateStart(startDate), endAt: dateEnd(endDate) };
  }

  const now = typeof query.now === "string" ? new Date(query.now) : new Date();
  if (Number.isNaN(now.getTime())) throw badRequest("Now must be a valid date");
  return { range, startAt: startFromPreset(range, now), endAt: now.toISOString() };
}

function toPerson(row: PersonRow): PersonDto {
  return {
    publicId: row.public_id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    email: row.email,
    archived: row.archived_at !== null,
  };
}

function getAttendees(db: AppDatabase, meetingId: number) {
  const rows = db
    .prepare(
      `SELECT people.public_id, people.first_name, people.last_name,
              people.name, people.email, people.archived_at
       FROM meeting_attendees
       JOIN people ON people.id = meeting_attendees.person_id
       WHERE meeting_attendees.meeting_id = ?
       ORDER BY people.name COLLATE NOCASE`,
    )
    .all(meetingId) as PersonRow[];
  return rows.map(toPerson);
}

function toMeetingNote(db: AppDatabase, row: MeetingNoteRow): MeetingNoteDto {
  const matchReasons: MeetingNoteMatchReason[] = [];
  if (row.created_by_user_id !== null) matchReasons.push("creator");
  if (row.is_attendee === 1) matchReasons.push("attendee");

  return {
    publicId: row.public_id,
    title: row.title,
    startsAt: row.starts_at,
    notes: row.notes,
    attendees: getAttendees(db, row.id),
    matchReasons,
  };
}

export function notesRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/meeting-notes", (req, res, next) => {
    try {
      const { startAt, endAt } = resolveWindow(req.query);
      const userId = req.user?.id ?? 0;
      const teamId = req.user?.teamId ?? 0;
      const email = req.user?.email ?? "";

      const rows = db
        .prepare(
          `SELECT meetings.id,
                  meetings.public_id,
                  meetings.title,
                  meetings.starts_at,
                  meetings.notes,
                  CASE WHEN meetings.created_by_user_id = ? THEN meetings.created_by_user_id ELSE NULL END AS created_by_user_id,
                  CASE WHEN EXISTS (
                    SELECT 1
                    FROM meeting_attendees
                    JOIN people ON people.id = meeting_attendees.person_id
                    WHERE meeting_attendees.meeting_id = meetings.id
                    AND people.team_id = meetings.team_id
                    AND people.archived_at IS NULL
                    AND lower(people.email) = lower(?)
                  ) THEN 1 ELSE 0 END AS is_attendee
           FROM meetings
           WHERE meetings.team_id = ?
           AND meetings.archived_at IS NULL
           AND meetings.starts_at >= ?
           AND meetings.starts_at <= ?
           AND trim(meetings.notes) <> ''
           AND (meetings.private = 0 OR meetings.created_by_user_id = ?)
           AND (
             meetings.created_by_user_id = ?
             OR EXISTS (
               SELECT 1
               FROM meeting_attendees
               JOIN people ON people.id = meeting_attendees.person_id
               WHERE meeting_attendees.meeting_id = meetings.id
               AND people.team_id = meetings.team_id
               AND people.archived_at IS NULL
               AND lower(people.email) = lower(?)
             )
           )
           ORDER BY meetings.starts_at DESC, meetings.id DESC`,
        )
        .all(userId, email, teamId, startAt, endAt, userId, userId, email) as MeetingNoteRow[];

      res.json({ notes: rows.map((row) => toMeetingNote(db, row)) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

- [ ] **Step 5: Mount the route**

In `server/app.ts`, import and mount:

```ts
import { notesRoutes } from "./notes/routes.js";
```

Inside protected route setup, after preferences or near other `/me` routes:

```ts
protectedApi.use("/me", notesRoutes(db));
```

- [ ] **Step 6: Run server tests to verify GREEN**

Run: `npm run test -- tests/server/meeting-notes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit backend endpoint**

Run:

```bash
git add shared/types.ts server/app.ts server/notes/routes.ts tests/server/meeting-notes.test.ts
git commit -m "Add my meeting notes endpoint"
```

## Task 2: API Client and Notes Page

**Files:**
- Modify: `src/api/client.ts`
- Create: `src/features/notes/MeetingNotesPage.tsx`
- Test: `tests/client/meeting-notes.test.tsx`

- [ ] **Step 1: Write failing client tests**

Create `tests/client/meeting-notes.test.tsx` with a fetch mock that returns `/api/me`, preferences, and meeting notes. Assert that the Notes page loads week results, switches range, shows custom errors, renders markdown notes, and opens a meeting.

Use this test shape:

```ts
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function setupFetch() {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/auth/me") {
      return json({
        user: {
          id: 1,
          name: "Editor",
          email: "editor@example.com",
          role: "admin",
          team: { id: 1, name: "Default Team", logoUrl: null, workCalendarUrl: null },
        },
      });
    }
    if (url === "/api/me/preferences") {
      return json({
        workCalendarUrl: null,
        googleCalendarConfigured: false,
        googleCalendarConnected: false,
        googleCalendarEmail: null,
      });
    }
    if (url.startsWith("/api/me/meeting-notes")) {
      return json({
        notes: [
          {
            publicId: "M001",
            title: "Weekly Ops",
            startsAt: "2026-07-13T15:00:00.000Z",
            notes: "## Launch notes\n\nP001 is ready.",
            attendees: [
              {
                publicId: "P001",
                firstName: "Editor",
                lastName: "Person",
                name: "Editor Person",
                email: "editor@example.com",
                archived: false,
              },
            ],
            matchReasons: ["creator", "attendee"],
          },
        ],
      });
    }
    if (url === "/api/dashboard") {
      return json({
        alerts: { overdue: [], dueSoon: [] },
        openTasksByAssignee: [],
        activeBlockers: { tasks: [], meetings: [] },
        recentMeetings: [],
        recentDecisions: [],
        activeSeries: [],
      });
    }
    return json({});
  });
}

describe("MeetingNotesPage", () => {
  it("loads my meeting notes and opens the source meeting", async () => {
    setupFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));

    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Launch notes" })).toBeInTheDocument();
    expect(screen.getByText("Editor Person")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open meeting M001" }));

    expect(await screen.findByRole("heading", { name: "Meetings" })).toBeInTheDocument();
  });

  it("requests preset and custom ranges", async () => {
    setupFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByRole("button", { name: "Day" }));
    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    await userEvent.type(screen.getByLabelText("Start date"), "2026-07-01");
    await userEvent.type(screen.getByLabelText("End date"), "2026-07-14");
    await userEvent.click(screen.getByRole("button", { name: "Apply custom range" }));

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain("/api/me/meeting-notes?range=week");
    expect(urls).toContain("/api/me/meeting-notes?range=day");
    expect(urls).toContain(
      "/api/me/meeting-notes?range=custom&startDate=2026-07-01&endDate=2026-07-14",
    );
  });

  it("shows validation for an incomplete custom range", async () => {
    setupFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply custom range" }));

    expect(screen.getByText("Choose a start and end date.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run client test to verify RED**

Run: `npm run test -- tests/client/meeting-notes.test.tsx`

Expected: FAIL because the Notes navigation and page do not exist.

- [ ] **Step 3: Add API client types and method**

In `src/api/client.ts`, import `MeetingNoteDto`, add:

```ts
export type MeetingNotesRange = "day" | "week" | "month" | "custom";

export type MeetingNotesQuery = {
  range: MeetingNotesRange;
  startDate?: string;
  endDate?: string;
};
```

Add to `api`:

```ts
meetingNotes: {
  list: (query: MeetingNotesQuery) => {
    const params = new URLSearchParams({ range: query.range });
    if (query.startDate) params.set("startDate", query.startDate);
    if (query.endDate) params.set("endDate", query.endDate);
    return request<{ notes: MeetingNoteDto[] }>(`/api/me/meeting-notes?${params}`);
  },
},
```

- [ ] **Step 4: Implement `MeetingNotesPage`**

Create `src/features/notes/MeetingNotesPage.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { MeetingNoteDto } from "../../../shared/types";
import { api, type MeetingNotesRange } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { RichNoteText } from "../../components/RichNotes";

const presets: Array<{ label: string; value: Exclude<MeetingNotesRange, "custom"> }> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function matchLabel(note: MeetingNoteDto) {
  if (note.matchReasons.includes("creator") && note.matchReasons.includes("attendee")) {
    return "Created by you and attended by you";
  }
  if (note.matchReasons.includes("creator")) return "Created by you";
  return "Attended by you";
}

export function MeetingNotesPage({
  onOpenMeeting,
}: {
  onOpenMeeting: (publicId: string) => void;
}) {
  const [range, setRange] = useState<MeetingNotesRange>("week");
  const [appliedCustomRange, setAppliedCustomRange] = useState({ startDate: "", endDate: "" });
  const [customRange, setCustomRange] = useState({ startDate: "", endDate: "" });
  const [notes, setNotes] = useState<MeetingNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(
    () => ({
      range,
      startDate: range === "custom" ? appliedCustomRange.startDate : undefined,
      endDate: range === "custom" ? appliedCustomRange.endDate : undefined,
    }),
    [appliedCustomRange.endDate, appliedCustomRange.startDate, range],
  );

  useEffect(() => {
    if (query.range === "custom" && (!query.startDate || !query.endDate)) return;

    let active = true;
    setLoading(true);
    setError("");
    void api.meetingNotes
      .list(query)
      .then((result) => {
        if (!active) return;
        setNotes(result.notes);
      })
      .catch((apiError: Error) => {
        if (!active) return;
        setNotes([]);
        setError(apiError.message || "Could not load notes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  function selectPreset(nextRange: Exclude<MeetingNotesRange, "custom">) {
    setRange(nextRange);
    setError("");
  }

  function applyCustomRange() {
    if (!customRange.startDate || !customRange.endDate) {
      setError("Choose a start and end date.");
      return;
    }
    if (customRange.startDate > customRange.endDate) {
      setError("Start date must be before end date.");
      return;
    }
    setAppliedCustomRange(customRange);
    setRange("custom");
    setError("");
  }

  return (
    <main className="page meeting-notes-index-page">
      <header className="page-header">
        <h2>Notes</h2>
      </header>
      <section className="notes-filter-bar" aria-label="Meeting notes filters">
        <div className="segmented-control" aria-label="Preset ranges">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              aria-pressed={range === preset.value}
              onClick={() => selectPreset(preset.value)}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" aria-pressed={range === "custom"} onClick={() => setRange("custom")}>
            Custom
          </button>
        </div>
        {range === "custom" ? (
          <div className="notes-custom-range">
            <label>
              <span>Start date</span>
              <input
                aria-label="Start date"
                type="date"
                value={customRange.startDate}
                onChange={(event) =>
                  setCustomRange((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label>
              <span>End date</span>
              <input
                aria-label="End date"
                type="date"
                value={customRange.endDate}
                onChange={(event) =>
                  setCustomRange((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
            <button className="secondary-button" type="button" onClick={applyCustomRange}>
              Apply custom range
            </button>
          </div>
        ) : null}
      </section>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="muted-text">Loading notes...</p> : null}
      {!loading && notes.length === 0 && !error ? (
        <EmptyState title="No notes" detail="No meeting notes match this range." />
      ) : null}
      <div className="meeting-note-list">
        {notes.map((note) => (
          <article className="meeting-note-card" key={note.publicId}>
            <header className="meeting-note-card-header">
              <div>
                <p className="meeting-note-meta">{matchLabel(note)}</p>
                <h3>{note.title}</h3>
                <span>
                  {note.publicId} - {formatDateTime(note.startsAt)}
                </span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onOpenMeeting(note.publicId)}
              >
                Open meeting {note.publicId}
              </button>
            </header>
            {note.attendees.length > 0 ? (
              <p className="meeting-note-attendees">
                {note.attendees.map((attendee) => attendee.name).join(", ")}
              </p>
            ) : null}
            <RichNoteText text={note.notes} onRecordOpen={undefined} />
          </article>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run client test to verify GREEN for page internals after routing work in Task 3**

Run after Task 3 is complete: `npm run test -- tests/client/meeting-notes.test.tsx`

Expected after Task 3: PASS.

## Task 3: Navigation and App Wiring

**Files:**
- Modify: `src/components/shellNavigation.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/client/app-shell.test.tsx`

- [ ] **Step 1: Update navigation**

In `src/components/shellNavigation.tsx`, import `NotebookText` from `lucide-react`, add `"Notes"` after `"Meetings"` in `navItems`, and add:

```ts
Notes: {
  icon: NotebookText,
  description: "Review your recent meeting notes by date range.",
  contextRows: [{ label: "Last day" }, { label: "Last week" }, { label: "Last month" }, { label: "Custom range" }],
},
```

- [ ] **Step 2: Wire App routing**

In `src/App.tsx`, import `MeetingNotesPage`, add `"Notes"` to the `FocusableSection` exclusion by keeping `FocusableSection` as task/meeting/decision/person only, and add a switch case:

```tsx
case "Notes":
  return (
    <MeetingNotesPage
      onOpenMeeting={(publicId) => {
        onRecordReferenceOpen({ type: "meeting", publicId });
      }}
    />
  );
```

- [ ] **Step 3: Add styles**

In `src/styles.css`, add styles for:

```css
.notes-filter-bar { ... }
.segmented-control { ... }
.segmented-control button[aria-pressed="true"] { ... }
.notes-custom-range { ... }
.meeting-note-list { ... }
.meeting-note-card { ... }
.meeting-note-card-header { ... }
.meeting-note-meta { ... }
.meeting-note-attendees { ... }
```

Use existing color variables and 8px or smaller radii.

- [ ] **Step 4: Update AppShell expectations if needed**

Run: `npm run test -- tests/client/app-shell.test.tsx tests/client/meeting-notes.test.tsx`

Expected: app-shell tests may need expected nav/context text updates for the new Notes item. Update assertions narrowly if failures mention navigation order or labels.

- [ ] **Step 5: Commit client feature**

Run:

```bash
git add src/api/client.ts src/features/notes/MeetingNotesPage.tsx src/components/shellNavigation.tsx src/App.tsx src/styles.css tests/client/meeting-notes.test.tsx tests/client/app-shell.test.tsx
git commit -m "Add my meeting notes page"
```

## Task 4: Verification

**Files:**
- Potentially modify files touched by Tasks 1-3 only.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test -- tests/server/meeting-notes.test.ts tests/client/meeting-notes.test.tsx tests/client/app-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run project checks**

Run:

```bash
npm run check
```

Expected: PASS. If it fails with sandbox IPC/listen errors, rerun outside the sandbox before treating it as a code failure.

- [ ] **Step 3: Run full tests**

Run:

```bash
npm run test
```

Expected: PASS. If full Vitest fails with `listen EPERM`, rerun outside the sandbox.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files changed since the last task commit.

## Self-Review

- Spec coverage: Backend endpoint, user/attendee matching, date ranges, visibility, UI navigation, rich notes, opening meetings, and tests are all covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: `MeetingNoteDto`, `MeetingNoteMatchReason`, `MeetingNotesRange`, and `MeetingNotesQuery` names are consistent across tasks.
