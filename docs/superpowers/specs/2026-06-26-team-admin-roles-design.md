# Team Admin Roles Design

## Purpose

Add a single-team model so users from the same company or affinity group can share work while admins can manage team configuration and user access.

This changes the original v1 assumption that all signed-in users share one global workspace with no permissions. The new model keeps the app deliberately simple: each user belongs to exactly one team, and each user has one role inside that team.

## Approved Direction

Use single-team membership only.

- Each user belongs to exactly one team.
- A team has shared records for that group.
- Users have one role: `admin` or `member`.
- Admins can configure team settings.
- Admins can add users directly and assign roles.
- Members can use the app but cannot change team settings or manage users.

This avoids multi-team membership, cross-team switching, and per-record ACLs. Those would turn this into a permissions platform, which is not the product being built.

## Roles

### Admin

Admins can:

- View and use all non-private records in their team.
- Create, edit, archive, and restore normal records in their team.
- Configure team logo/name branding.
- Configure the shared team calendar shortcut URL.
- Add users directly to their team.
- Choose a new user's role as `admin` or `member`.
- Change another user's role between `admin` and `member`.

Admin safeguards:

- The app must prevent demoting the last admin in a team.
- The app must prevent creating users outside the current admin's team.
- Server routes must enforce admin-only writes; hiding UI controls is not sufficient.

### Member

Members can:

- View and use non-private records in their team.
- Create, edit, archive, and restore normal records in their team.
- Create private tasks and meetings visible only to themselves.
- Use their own Google Calendar OAuth connection if configured.

Members cannot:

- Open or use admin settings.
- Change logo, team name, or shared calendar settings.
- Add users.
- Change user roles.

## Team Sharing Boundary

Team is the shared data boundary.

These records belong to one team:

- People
- Tasks
- Meetings
- Meeting series
- Decisions

Queries must only return records for the signed-in user's team. Record creation must stamp the current user's team onto new shared records. Updates that reference related records must reject cross-team public IDs.

Private records remain personal inside the team:

- A private task or meeting is visible only to its creator.
- Private does not bypass team ownership.
- A user never sees records from another team, private or shared.

## Data Model

Add a `teams` table:

- `id`
- `name`
- `logo_url`
- `work_calendar_url`
- timestamps

Add team and role fields to `users`:

- `team_id`
- `role`, constrained to `admin` or `member`

Add `team_id` to shared record tables:

- `people`
- `tasks`
- `meetings`
- `meeting_series`
- `decisions`

Keep existing user preference and Google Calendar tables:

- `user_preferences` can remain for user-local fallbacks during migration.
- `google_calendar_connections` remains user-specific because OAuth access belongs to an individual account.

Use direct `users.team_id` rather than a membership join table. Single-team only means a join table would be ceremony pretending to be architecture.

## Migration

Existing deployments need a safe default migration:

1. Create one default team.
2. Assign every existing user to that team.
3. Set every existing user to `admin` to avoid accidentally locking out production users.
4. Assign all existing shared records to the default team.
5. Keep existing per-user calendar preferences available until team settings replace the visible shared shortcut.

The migration must preserve all existing public IDs, audit events, private flags, and creator IDs.

## Admin Settings UI

Add an Admin section that is visible only to admins.

The Admin section should include:

- Team settings form:
  - Team display name
  - Logo URL
  - Shared calendar URL
- User management:
  - User list for the current team
  - Direct add-user form
  - Role selector for each user

Direct user creation form:

- Name
- Email
- Temporary password
- Role

Role changes should be immediate after save and should show a clear inline error if the last-admin safeguard blocks the change.

Do not expose admin controls to members. If a member manually calls the API, the server returns `403`.

## Branding And Calendar Behavior

Team logo/name settings should feed the app shell branding.

Shared calendar URL should become the main calendar shortcut used by the app shell and meetings screen. A user-level calendar shortcut can remain as a fallback during the first migration pass, but team settings should be the source of truth once configured.

Google Calendar OAuth remains per-user:

- A user's connected Google account is not shared with the team.
- Team shared calendar URL is only a shortcut/configuration field.

## API Shape

Extend current auth responses so the client knows the user's role and team:

- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/signup`

Recommended user DTO:

```ts
type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  team: {
    id: number;
    name: string;
    logoUrl: string | null;
  };
};
```

Add admin routes under `/api/admin`:

- `GET /api/admin/team`
- `PUT /api/admin/team`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:userId/role`

Invite-code signup should remain available. Invite codes should belong to a team, and signup through an invite should create a `member` by default unless an admin-specific invite role is added later.

## Server Authorization

Add two reusable server helpers:

- `requireAuth`: loads the current user with team and role.
- `requireAdmin`: requires `role = 'admin'`.

Every protected route should use the current user's `teamId` when reading or writing team-scoped records.

All server-side relation resolution must become team-aware:

- Assignees must be people in the current team.
- Meeting attendees must be people in the current team.
- Meeting series must be in the current team.
- Linked tasks must be visible inside the current team.
- Decisions can only link to meetings in the current team.

## Testing

Server coverage:

- Existing users and records migrate into the default team.
- Existing users become admins.
- Admin can update team settings.
- Member cannot update team settings.
- Admin can add a user to their team.
- Admin can assign user roles.
- Last admin cannot be demoted.
- Users only see records from their own team.
- Private records remain visible only to the creator within the team.
- Cross-team related public IDs are rejected.

Client coverage:

- Admin section appears for admins.
- Admin section is hidden for members.
- Admin can save team logo/name/calendar settings.
- Admin can create a user and choose role.
- Admin can change a user's role.
- Last-admin error is displayed.
- App shell uses team branding and shared calendar URL.

Run the standard checks:

```bash
npm run check
npm run test
npm run build
```

## Out Of Scope

- Multi-team membership.
- Team switching.
- Per-record permissions beyond existing private records.
- User deletion or deactivation.
- Emailing temporary passwords.
- Sharing Google OAuth connections across a team.
- Full audit trails for admin setting changes beyond existing audit patterns, unless implementation finds a low-cost way to reuse the audit log.

## Approval

The user approved:

- Single-team only.
- Admin/member roles.
- Admin team configuration for logo and shared calendar.
- Admin direct user creation.
- Admin role assignment.
