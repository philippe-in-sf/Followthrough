# Task Manager Design

## Purpose

Build a real multi-user web task manager for capturing meeting notes, assigned work, standalone tasks, and decisions. The app will run on a single server, use simple authentication, and provide a shared workspace where every logged-in user can view and edit all records.

## Decisions

- Deployment target: one server or VPS-style host.
- App shape: Express API and static hosting with a React frontend.
- Database: SQLite.
- Workspace model: one shared workspace, no roles or permissions.
- Signup model: invite-code self-signup.
- Assignees and attendees: shared People records, not login users.
- Recurring meetings: manual creation of each occurrence.
- Recurring task carry-over: the same unfinished task continues into the next meeting instance.
- Task statuses: `Open`, `In Progress`, `Blocked`, `Done`.
- Dashboard direction: dashboard-first, with strong section pages behind it.
- Alerts: in-app only for due-soon and overdue tasks.

## Architecture

The application will be a single TypeScript web app with a React + Vite frontend and an Express backend. Express will serve both the API and the built frontend so deployment is a single Node process.

The backend owns authentication, validation, persistence, search, and ID generation. The frontend owns navigation, dashboard presentation, form state, search/filter controls, and record detail/edit screens.

The SQLite database will live on disk in a backup-friendly location. Schema changes will be handled through migrations. Passwords will be hashed, sessions will be cookie-based, and signup will require an invite code.

Domain areas:

- Auth
- People
- Meetings
- Meeting series
- Tasks
- Decisions
- Search
- Dashboard summaries and alerts

## Authentication

Users are only app users: people who can log in, enter information, and use the app. They are not the same thing as assignees or attendees.

V1 auth includes:

- Login
- Logout
- Invite-code signup
- Password hashing
- Server-side sessions

There is no permissions model in v1. Any authenticated user can view and edit all meetings, tasks, decisions, and people.

## Identifiers

The server will generate easy-to-remember public IDs in database transactions:

- Tasks: `T001`, `T002`, etc.
- Meetings: `M001`, `M002`, etc.
- Decisions: `D001`, `D002`, etc.
- People: `P001`, `P002`, etc.
- Meeting series: `S001`, `S002`, etc.

The numeric portion should grow as needed rather than being limited to three digits.

## Data Model

### Users

Login accounts with:

- Name
- Email
- Password hash
- Created timestamp

### Invite Codes

Signup codes with:

- Code
- Optional label
- Active state
- Optional usage limit
- Usage count
- Created timestamp

V1 can start with one manually configured invite code.

### People

Shared records used for assignees and attendees:

- Public ID
- Name
- Optional email
- Archived state
- Created and updated timestamps

Duplicate names should trigger a warning in the UI but should not be hard-blocked.

### Meeting Series

Recurring meeting threads:

- Public ID
- Title
- Optional cadence label
- Active state
- Created and updated timestamps

The app will not auto-schedule meeting instances.

### Meetings

Meeting records:

- Public ID
- Title
- Date/time
- Meeting type: single or recurring instance
- Optional meeting series
- Summary
- Attendee links to People
- Created and updated timestamps
- Archived state

Recurring meeting instances belong to a meeting series. Single meetings do not.

### Tasks

Task records:

- Public ID
- Description
- Assignee link to People
- Status: `Open`, `In Progress`, `Blocked`, `Done`
- Due date
- Optional origin meeting
- Optional meeting series
- Created and updated timestamps
- Archived state

Standalone tasks use the same table and simply have no origin meeting or meeting series. This keeps task search, status updates, alerts, and assignee filtering consistent.

### Meeting Task Links

Links between meetings and tasks allow the same task to appear in multiple recurring meeting instances without copying the task.

Fields:

- Meeting ID
- Task ID
- Created timestamp

### Decisions

Decision records:

- Public ID
- Decision text
- Decision date
- Context or notes
- Optional related meeting
- Created and updated timestamps
- Archived state

## Recurring Meeting Carry-Over

Users manually create the next meeting occurrence for a meeting series. When that happens, the backend creates the new meeting and links all non-`Done`, non-archived tasks from the same series to that meeting.

The task remains the same task. Its public ID, assignee, status, and due date do not change just because it appears in another meeting.

The carry-over operation must run in a database transaction. Either the meeting and all carry-over links are created, or none of them are.

## Alerts

Alerts are in-app only for v1. The app will compute task alert state from due dates and statuses rather than storing separate notification records.

Alert states:

- `Overdue`: task due date is before today and status is not `Done`.
- `Due soon`: task due date is within the configured threshold and status is not `Done`.

The default due-soon threshold is 7 days. It should be defined in configuration so it can be changed later without redesigning the feature.

Alert surfaces:

- Dashboard alert summary
- Prioritized dashboard alert list
- Task list filters for `Due soon` and `Overdue`
- Badges on task rows and task detail pages
- Counts grouped by assignee where useful

## User Experience

After login, users land on a dashboard-first workspace.

The dashboard includes:

- Global search
- Open task summary grouped by assignee
- Due-soon and overdue task alerts
- Upcoming or recent meetings
- Recurring meeting series with a create-next-meeting action
- Recent decisions
- Quick actions for creating meetings, tasks, decisions, and people

Primary sections:

- Tasks
- Meetings
- Meeting Series
- Decisions
- People

Each primary content type supports create, view, edit, search, and archive where appropriate.

Task screens support:

- Assignee filter
- Status filter
- Due-soon filter
- Overdue filter
- Due date visibility
- Status updates

Meeting screens support:

- Attendee selection from People
- Summary editing
- Assigned task creation and linking
- Decision creation and linking
- Single meeting creation
- Recurring instance creation

Meeting series screens support:

- Series creation and editing
- Manual next-meeting creation
- Review of open carried-over tasks

Decision screens support:

- Searchable decision list
- Decision detail/edit
- Optional related meeting

People screens support:

- Shared person list
- Name and optional email editing
- Archive behavior for people no longer in use

## Search

The app will provide one global search endpoint across:

- Public IDs
- Meeting titles
- Meeting summaries
- Task descriptions
- Decision text
- Decision notes/context
- People names
- People email addresses

Typing an exact public ID such as `T002`, `M001`, or `D001` should jump directly to that record or place it as the top search result.

Section screens may add scoped filters for their content type.

## Editing And Archive Behavior

Records should use soft archive rather than hard delete in v1 for meetings, tasks, decisions, people, and meeting series. Archived records should be hidden from default lists but remain available for historical links and future recovery.

All create and update operations should be validated on the server and timestamped.

## Error Handling

Expected error behavior:

- Inline form validation messages for missing or invalid fields.
- Clear login and signup errors.
- Duplicate person name warnings.
- Not-found pages for missing records.
- Transactional failure handling for recurring meeting carry-over.
- Friendly empty states for lists, search results, and dashboards.

## Testing

Backend tests should cover:

- Invite-code signup
- Login/logout/session behavior
- Public ID generation
- People CRUD and archive
- Meeting CRUD and archive
- Task CRUD, filters, statuses, and alerts
- Decision CRUD and archive
- Global search
- Recurring meeting carry-over

Frontend tests should cover:

- Login and signup flow
- Dashboard loading
- Global search and direct ID lookup
- Create/edit task
- Task assignee/status/alert filters
- Create meeting
- Create recurring meeting occurrence with carry-over tasks
- Create/edit decision

Before handoff, the project should pass:

- Type checking
- Unit/integration tests
- Production build

## Out Of Scope For V1

- Role-based permissions
- Email notifications
- Calendar integration
- Automatic recurring meeting scheduling
- External identity provider login
- Multiple organizations or workspaces
- Custom task statuses
- Hard delete workflows
