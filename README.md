# Web UI Task Manager

A single-server multi-user task manager for meetings, tasks, standalone tasks, decisions, and shared people records. Users log in only to enter and use the app. Meeting attendees and task assignees are tracked in the shared People list and do not need accounts.

## Features

- Invite-code signup and simple session login
- Shared People list for assignees and meeting attendees
- Meetings with date/time, attendees, summary, linked tasks, and public IDs like `M001`
- Single meetings and recurring meeting series
- Manual next-occurrence creation for recurring meetings
- Recurring occurrences carry over the same unfinished series tasks
- Tasks with description, assignee, status, due date, alerts, and public IDs like `T001`
- Standalone tasks outside meetings
- Decisions with optional meeting link and public IDs like `D001`
- Global search across IDs, tasks, meetings, decisions, and people
- In-app overdue and due-soon task alerting

## Requirements

- Node.js 24 or newer
- npm

The database uses Node's built-in SQLite support, so older Node versions are not supported.

## Setup

```bash
npm install
cp .env.example .env
npm run invite:create -- --code=team-start --limit=10 --label=Initial
npm run dev
```

Open `http://localhost:3000`, sign up with the invite code, then log in.

## Configuration

Environment variables are optional and default to the values in `.env.example`.

```text
PORT=3000
DATABASE_PATH=data/task-manager.sqlite
SESSION_COOKIE_NAME=tm_session
SESSION_TTL_DAYS=14
DUE_SOON_DAYS=7
```

`DUE_SOON_DAYS` controls the in-app due-soon alert window. With the default value, open tasks due in the next 7 days appear in Due soon.

## Production Run

```bash
npm run build
NODE_ENV=production npm start
```

The production server serves both the API and built frontend from one Express process. Keep `DATABASE_PATH` pointed at persistent storage.

## Verification

```bash
npm run test
npm run check
npm run build
```

These cover server routes, database behavior, auth, recurring carry-over, search/dashboard APIs, and frontend workflows.
