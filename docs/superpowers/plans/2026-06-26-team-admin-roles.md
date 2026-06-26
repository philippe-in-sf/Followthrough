# Team Admin Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-team workspaces, admin/member roles, admin-managed team settings, and direct admin user creation.

**Architecture:** Add team ownership to users and shared records in SQLite, load role/team context into authenticated requests, and enforce team scoping in every protected server route. Add an admin-only API and a compact Admin section in the React shell for team settings and user management.

**Tech Stack:** React 19, TypeScript, Express 5, SQLite migrations, Vitest, Testing Library, Supertest.

---

## File Structure

- Create `server/db/migrations/012_team_admin_roles.sql` for teams, user roles, team IDs on shared records, invite-code team ownership, and safe default migration.
- Create `server/admin/routes.ts` for admin-only team settings and user management endpoints.
- Modify `server/auth/sessions.ts` so `AuthUser` includes `role`, `teamId`, `teamName`, `teamLogoUrl`, and `teamWorkCalendarUrl`.
- Modify `server/auth/authMiddleware.ts` to add `requireAdmin`.
- Modify `server/auth/routes.ts`, `server/auth/userManagement.ts`, `server/auth/createUser.ts`, and `server/auth/createInviteCode.ts` for team-aware users and invite defaults.
- Modify shared and client types in `shared/types.ts`, `shared/schemas.ts`, and `src/api/types.ts`.
- Modify route modules for team scoping: `server/people/routes.ts`, `server/tasks/routes.ts`, `server/meetings/routes.ts`, `server/decisions/routes.ts`, `server/dashboard/routes.ts`, `server/search/routes.ts`, and `server/preferences/routes.ts`.
- Create `src/features/admin/AdminPage.tsx`.
- Modify `src/api/client.ts`, `src/App.tsx`, `src/components/AppShell.tsx`, `src/components/BrandMark.tsx`, `src/components/IconRail.tsx`, `src/components/ContextRail.tsx`, `src/components/MobileSectionSummary.tsx`, `src/components/shellNavigation.tsx`, `src/features/meetings/MeetingsPage.tsx`, and `src/styles.css`.
- Add/modify tests in `tests/server/database.test.ts`, `tests/server/auth.test.ts`, `tests/server/admin.test.ts`, `tests/server/search-dashboard.test.ts`, `tests/server/people.test.ts`, `tests/server/tasks.test.ts`, `tests/server/meetings.test.ts`, `tests/server/decisions.test.ts`, `tests/client/app-shell.test.tsx`, `tests/client/auth-shell.test.tsx`, `tests/client/dashboard.test.tsx`, and `tests/client/admin-page.test.tsx`.

## Task 1: Team Migration And Auth Context

**Files:**
- Create: `server/db/migrations/012_team_admin_roles.sql`
- Modify: `server/auth/sessions.ts`
- Modify: `server/auth/routes.ts`
- Modify: `server/auth/userManagement.ts`
- Modify: `server/auth/createUser.ts`
- Modify: `server/auth/createInviteCode.ts`
- Modify: `src/api/types.ts`
- Test: `tests/server/database.test.ts`
- Test: `tests/server/auth.test.ts`

- [ ] **Step 1: Write failing migration tests**

Add tests asserting migrated databases include a default team, existing users are admins in that team, and existing people/tasks/meetings/series/decisions are assigned to the default team.

Run:

```bash
npm run test -- tests/server/database.test.ts --testNamePattern "team"
```

Expected: FAIL because the `teams` table and `team_id` columns do not exist.

- [ ] **Step 2: Write failing auth context tests**

Add tests asserting signup, login, and `/api/auth/me` return:

```ts
{
  user: {
    id: 1,
    name: "Editor",
    email: "editor@example.com",
    role: "member",
    team: {
      id: 1,
      name: "Default Team",
      logoUrl: null,
      workCalendarUrl: null,
    },
  },
}
```

Also assert direct `createUser` can create an admin when given `role: "admin"`.

Run:

```bash
npm run test -- tests/server/auth.test.ts --testNamePattern "role|team|admin"
```

Expected: FAIL because auth DTOs do not include team or role.

- [ ] **Step 3: Implement the migration**

Create migration `012_team_admin_roles.sql` to:

- Create `teams`.
- Insert one default team if none exists.
- Add `team_id` and `role` to `users`.
- Backfill all existing users to default team and role `admin`.
- Add `team_id` to `people`, `tasks`, `meetings`, `meeting_series`, and `decisions`.
- Backfill all existing records to default team.
- Add `team_id` and `default_role` to `invite_codes`.
- Backfill existing invite codes to default team and role `member`.
- Add indexes for team-scoped lookups.

- [ ] **Step 4: Implement auth context**

Update `AuthUser`, `getSessionUser`, signup, login, and `/api/auth/me` so all authenticated responses return role and team details. Signup should use the invite code's team and default role. Direct user creation should accept optional `teamId` and `role`, defaulting to the default team and `admin` for CLI-created users.

- [ ] **Step 5: Verify Task 1**

Run:

```bash
npm run test -- tests/server/database.test.ts tests/server/auth.test.ts
```

Expected: PASS.

## Task 2: Admin API

**Files:**
- Create: `server/admin/routes.ts`
- Modify: `server/auth/authMiddleware.ts`
- Modify: `server/app.ts`
- Modify: `shared/types.ts`
- Modify: `shared/schemas.ts`
- Test: `tests/server/admin.test.ts`

- [ ] **Step 1: Write failing admin API tests**

Create `tests/server/admin.test.ts` covering:

- Admin can read team settings and users.
- Admin can update team name, logo URL, and shared calendar URL.
- Admin can add a user to their team as `admin` or `member`.
- Admin can change another user's role.
- Member receives `403` from every `/api/admin/*` route.
- Last admin cannot be demoted.
- Invalid logo/calendar URLs return `400` without changing saved values.

Run:

```bash
npm run test -- tests/server/admin.test.ts
```

Expected: FAIL because `/api/admin` is not mounted.

- [ ] **Step 2: Implement authorization helpers**

Add `requireAdmin` beside `requireAuth`. It should return `403` with `{ error: "Admin access required" }` unless `req.user.role === "admin"`.

- [ ] **Step 3: Implement admin routes**

Add:

- `GET /api/admin/team`
- `PUT /api/admin/team`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:userId/role`

Keep all queries constrained to `req.user.teamId`. Hash direct-created passwords through the existing password helper. Reject demoting the last admin in the team.

- [ ] **Step 4: Verify Task 2**

Run:

```bash
npm run test -- tests/server/admin.test.ts tests/server/auth.test.ts
```

Expected: PASS.

## Task 3: Team-Scoped Records

**Files:**
- Modify: `server/people/routes.ts`
- Modify: `server/tasks/routes.ts`
- Modify: `server/meetings/routes.ts`
- Modify: `server/decisions/routes.ts`
- Modify: `server/dashboard/routes.ts`
- Modify: `server/search/routes.ts`
- Test: `tests/server/people.test.ts`
- Test: `tests/server/tasks.test.ts`
- Test: `tests/server/meetings.test.ts`
- Test: `tests/server/decisions.test.ts`
- Test: `tests/server/search-dashboard.test.ts`

- [ ] **Step 1: Write failing team-isolation tests**

Add tests proving that two users in different teams cannot see each other's people, tasks, meetings, series, decisions, dashboard records, or search results.

Run:

```bash
npm run test -- tests/server/people.test.ts tests/server/tasks.test.ts tests/server/meetings.test.ts tests/server/decisions.test.ts tests/server/search-dashboard.test.ts --testNamePattern "team"
```

Expected: FAIL because existing queries are global except for private records.

- [ ] **Step 2: Write failing cross-team relation tests**

Add tests proving cross-team assignee IDs, attendee IDs, task IDs, meeting IDs, and series IDs are rejected with `400` or `404` as currently appropriate for the route.

Run:

```bash
npm run test -- tests/server/tasks.test.ts tests/server/meetings.test.ts tests/server/decisions.test.ts --testNamePattern "cross-team"
```

Expected: FAIL because relation resolvers do not check `team_id`.

- [ ] **Step 3: Implement team stamps and filters**

Add `team_id = req.user.teamId` to record inserts. Add team filters to list/get/update/archive/restore/search/dashboard queries. Update relation resolvers to require matching `team_id`. Preserve the existing private-record behavior inside the team.

- [ ] **Step 4: Verify Task 3**

Run:

```bash
npm run test -- tests/server/people.test.ts tests/server/tasks.test.ts tests/server/meetings.test.ts tests/server/decisions.test.ts tests/server/search-dashboard.test.ts
```

Expected: PASS.

## Task 4: Client Types, Admin Navigation, And Team Branding

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/BrandMark.tsx`
- Modify: `src/components/IconRail.tsx`
- Modify: `src/components/ContextRail.tsx`
- Modify: `src/components/MobileSectionSummary.tsx`
- Modify: `src/components/shellNavigation.tsx`
- Modify: `src/features/meetings/MeetingsPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/client/app-shell.test.tsx`
- Test: `tests/client/auth-shell.test.tsx`
- Test: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Write failing shell/client tests**

Add tests asserting:

- Admin navigation appears for `role: "admin"`.
- Admin navigation is absent for `role: "member"`.
- Team logo/name appear in the shell when provided.
- Team shared calendar URL is used before user preference fallback.
- Existing auth shell tests pass with the expanded user DTO.

Run:

```bash
npm run test -- tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx tests/client/dashboard.test.tsx --testNamePattern "admin|team|calendar"
```

Expected: FAIL because the client has no admin section or team-aware user type.

- [ ] **Step 2: Implement client API and shell state**

Add admin client methods. Extend `User` with role/team. Add `Admin` to navigation metadata but filter it out for members. Pass team branding and calendar values into `AppShell`, `BrandMark`, `IconRail`, and Meetings.

- [ ] **Step 3: Verify Task 4**

Run:

```bash
npm run test -- tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx tests/client/dashboard.test.tsx
```

Expected: PASS.

## Task 5: Admin Page UI

**Files:**
- Create: `src/features/admin/AdminPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/client/admin-page.test.tsx`

- [ ] **Step 1: Write failing Admin page tests**

Create client tests covering:

- Loading team settings and users.
- Saving team settings.
- Creating a user with selected role.
- Changing a user's role.
- Displaying the last-admin error.

Run:

```bash
npm run test -- tests/client/admin-page.test.tsx
```

Expected: FAIL because `AdminPage` does not exist.

- [ ] **Step 2: Implement AdminPage**

Build a compact operational Admin page with two un-nested panels:

- Team settings form for name, logo URL, and shared calendar URL.
- User management list and add-user form.

Use native form controls and inline status/error messages. Do not add a marketing page, explanatory hero, or other decorative nonsense.

- [ ] **Step 3: Verify Task 5**

Run:

```bash
npm run test -- tests/client/admin-page.test.tsx tests/client/app-shell.test.tsx tests/client/dashboard.test.tsx
```

Expected: PASS.

## Task 6: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update docs**

Document:

- Admin users can add users directly.
- Invite signup creates members by default.
- Team settings own logo and shared calendar shortcut.
- Existing direct CLI user creation remains available for fallback administration.

- [ ] **Step 2: Run focused server and client suites**

Run:

```bash
npm run test -- tests/server/admin.test.ts tests/server/auth.test.ts tests/server/database.test.ts tests/server/people.test.ts tests/server/tasks.test.ts tests/server/meetings.test.ts tests/server/decisions.test.ts tests/server/search-dashboard.test.ts tests/client/admin-page.test.tsx tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx tests/client/dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full project verification**

Run:

```bash
npm run check
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 4: Inspect diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended files changed, plus the pre-existing untracked `deploy/com.philippe.web-ui-task-manager.plist`.

## Self-Review

- Spec coverage: migration, auth DTOs, admin APIs, direct user creation, role assignment, last-admin guard, team-scoped shared records, private record preservation, admin UI, team branding, and shared calendar behavior are all covered.
- Placeholder scan: no placeholder tasks remain.
- Type consistency: use `role`, `teamId`, `team`, `logoUrl`, and `workCalendarUrl` consistently across server and client DTOs.
