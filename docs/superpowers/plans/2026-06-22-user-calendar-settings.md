# User Calendar Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-user work calendar URL settings that any signed-in user can configure from the Meetings page.

**Architecture:** Add a `user_preferences` SQLite table keyed by `user_id`, a protected `/api/me/preferences` route, and a small client API wrapper. `App` owns the loaded preference state and passes the saved URL into `AppShell`; `MeetingsPage` renders the calendar URL settings form and notifies `App` after saves so the side rail updates immediately.

**Tech Stack:** React 19, TypeScript, Express 5, Node SQLite, Vitest, Testing Library, Supertest.

---

## File Structure

- Create `server/db/migrations/010_user_preferences.sql` for the per-user preference table.
- Create `server/preferences/store.ts` for SQLite read/write helpers and URL validation.
- Create `server/preferences/routes.ts` for authenticated preference endpoints.
- Modify `server/app.ts` to mount `/api/me/preferences`.
- Modify `shared/types.ts` to add `UserPreferencesDto`.
- Modify `src/api/client.ts` to add `api.preferences.get()` and `api.preferences.update()`.
- Modify `src/App.tsx` so signed-in app state owns `workCalendarUrl`.
- Modify `src/features/meetings/MeetingsPage.tsx` to render and save Calendar settings.
- Modify `src/styles.css` to style the Calendar settings form using existing compact panel patterns.
- Modify `.env.example` and `README.md` to document `VITE_WORK_CALENDAR_URL` as a fallback and OAuth env as server setup.
- Add/modify tests in `tests/server/preferences.test.ts`, `tests/client/google-calendar-client.test.ts`, and `tests/client/dashboard.test.tsx`.

## Task 1: Server Preferences API

**Files:**
- Create: `server/db/migrations/010_user_preferences.sql`
- Create: `server/preferences/store.ts`
- Create: `server/preferences/routes.ts`
- Modify: `server/app.ts`
- Modify: `shared/types.ts`
- Test: `tests/server/preferences.test.ts`

- [x] **Step 1: Write failing server tests**

Add `tests/server/preferences.test.ts` with tests for default preferences, saving a URL, clearing a URL, rejecting invalid URLs, and user isolation through separate sessions.

- [x] **Step 2: Run server preference tests and verify RED**

Run: `npm run test -- tests/server/preferences.test.ts`

Expected: FAIL because `/api/me/preferences` does not exist.

- [x] **Step 3: Implement migration and store**

Add `010_user_preferences.sql`, then implement `getUserPreferences`, `upsertUserPreferences`, and `parseWorkCalendarUrl` in `server/preferences/store.ts`.

- [x] **Step 4: Implement routes and mount them**

Add `server/preferences/routes.ts` with `GET /preferences` and `PUT /preferences`, then mount it as `protectedApi.use("/me", preferenceRoutes(db, config));` in `server/app.ts`.

- [x] **Step 5: Run server preference tests and verify GREEN**

Run: `npm run test -- tests/server/preferences.test.ts`

Expected: PASS.

## Task 2: Client API And Shell State

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/App.tsx`
- Test: `tests/client/google-calendar-client.test.ts`
- Test: `tests/client/dashboard.test.tsx`

- [x] **Step 1: Write failing client API test**

Add tests showing `api.preferences.get()` calls `/api/me/preferences` and `api.preferences.update()` sends `{ workCalendarUrl }`.

- [x] **Step 2: Run client API tests and verify RED**

Run: `npm run test -- tests/client/google-calendar-client.test.ts`

Expected: FAIL because `api.preferences` does not exist.

- [x] **Step 3: Implement client API methods**

Add `UserPreferencesDto` import and `preferences` methods to `src/api/client.ts`.

- [x] **Step 4: Write failing app-shell behavior test**

In `tests/client/dashboard.test.tsx`, mock `/api/me/preferences` and assert the side-rail work calendar shortcut renders from the saved user preference.

- [x] **Step 5: Run dashboard test and verify RED**

Run: `npm run test -- tests/client/dashboard.test.tsx --testNamePattern "loads the saved work calendar shortcut"`

Expected: FAIL because `App` does not fetch preferences.

- [x] **Step 6: Implement App preference loading**

Update `App` to fetch preferences after `api.me()`, store `workCalendarUrl`, pass it to `AppShell`, and clear it on logout.

- [x] **Step 7: Run client tests and verify GREEN**

Run: `npm run test -- tests/client/google-calendar-client.test.ts tests/client/dashboard.test.tsx`

Expected: PASS.

## Task 3: Meetings Calendar Settings UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/meetings/MeetingsPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/client/dashboard.test.tsx`

- [x] **Step 1: Write failing UI save and clear tests**

In `tests/client/dashboard.test.tsx`, add tests for saving a valid work calendar URL from Meetings, updating the side-rail shortcut without reload, clearing the URL, and showing a validation error.

- [x] **Step 2: Run dashboard UI tests and verify RED**

Run: `npm run test -- tests/client/dashboard.test.tsx --testNamePattern "work calendar"`

Expected: FAIL because the form does not exist.

- [x] **Step 3: Implement Meetings settings props and form**

Pass `workCalendarUrl` and `onWorkCalendarUrlChange` from `App` to `MeetingsPage`. Add a compact Calendar settings form with URL input, Save button, Clear button, inline success, and inline error state.

- [x] **Step 4: Style the settings panel**

Extend the existing `.calendar-import-panel` style family with `.calendar-settings-panel` and `.calendar-settings-actions` rules.

- [x] **Step 5: Run dashboard UI tests and verify GREEN**

Run: `npm run test -- tests/client/dashboard.test.tsx --testNamePattern "work calendar"`

Expected: PASS.

## Task 4: Docs And Full Verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: docs only if final notes require it

- [x] **Step 1: Write documentation changes**

Update `.env.example` with OAuth env vars and update README calendar config text so the app UI is the primary user path and `VITE_WORK_CALENDAR_URL` is only a fallback.

- [x] **Step 2: Run focused tests**

Run: `npm run test -- tests/server/preferences.test.ts tests/client/google-calendar-client.test.ts tests/client/dashboard.test.tsx`

Expected: PASS.

- [x] **Step 3: Run type checks**

Run: `npm run check`

Expected: PASS.

- [x] **Step 4: Inspect git diff**

Run: `git diff --stat` and `git diff --check`.

Expected: no whitespace errors and only intended files changed.
