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
- Manual and automatic email reminders for outstanding tasks
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
APP_BASE_URL=http://localhost:3000
TASK_REMINDER_EMAIL_FROM=
TASK_REMINDER_AUTO_ENABLED=false
TASK_REMINDER_AUTO_INTERVAL_MS=86400000
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

`DUE_SOON_DAYS` controls the in-app due-soon alert window. With the default value, open tasks due in the next 7 days appear in Due soon.

Email reminders use SMTP. Set `SMTP_HOST` and `TASK_REMINDER_EMAIL_FROM` to enable manual task reminder sends. Set `TASK_REMINDER_AUTO_ENABLED=true` to let the server send automatic reminders for open automatic-mode tasks that are overdue or due soon. Automatic reminders are throttled to once per task per day.

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

## Linux SSH Deployment

The app can be deployed to Linux hosts over SSH and run with `systemd`. The deployment path builds locally, checks the remote app version, pushes a release directory with `rsync`, keeps site data in a shared directory, restarts the service, and checks `/api/health`.

### Remote prerequisites

- Linux host reachable over SSH
- Node.js 24 or newer, required for Node's built-in SQLite support
- npm, with network access for remote `npm ci --omit=dev`
- rsync
- curl
- systemd
- SSH user with passwordless `sudo` for deploy app directory `mkdir`/`chown`, service unit install under `/etc/systemd/system`, `systemctl daemon-reload`, `systemctl enable`, and service restart
- Existing non-root service user and group for running the app

### Local site config

```bash
cp deploy/sites.example.env deploy/sites.env
```

Edit `deploy/sites.env`:

```bash
DEPLOY_SITES=production
DEPLOY_PRODUCTION_SSH=deploy@example.com
DEPLOY_PRODUCTION_APP_ROOT=/opt/web-ui-task-manager
DEPLOY_PRODUCTION_SERVICE_NAME=web-ui-task-manager
DEPLOY_PRODUCTION_PORT=3000
DEPLOY_PRODUCTION_KEEP_RELEASES=5

# Optional; both must already exist on the host and must be non-root.
DEPLOY_PRODUCTION_SERVICE_USER=web-ui-task-manager
DEPLOY_PRODUCTION_SERVICE_GROUP=web-ui-task-manager
```

`deploy/sites.env` is ignored by git because it is local machine configuration.

Site names use letters, numbers, and underscores. Service names omit the `.service` suffix, must start with an alphanumeric character, and use only letters, numbers, underscores, and hyphens. Service users and groups must be simple Linux account/group names and cannot be `root`.

If `DEPLOY_PRODUCTION_SERVICE_USER` is not set, `deploy@example.com` defaults the service user and group to `deploy`. Host aliases without a username default to `web-ui-task-manager`.

App roots must be deploy-safe absolute paths without spaces or shell metacharacters; `/`, `/opt`, and `/srv` are rejected.

### First-time service install

```bash
npm run deploy:install-systemd -- production
```

This creates the remote app layout, installs `/etc/systemd/system/web-ui-task-manager.service`, runs `systemctl daemon-reload`, and enables the service.

### Deploy one site

```bash
npm run version:patch
npm run deploy -- production
```

Each deploy should include a package version bump. The running app exposes the current version at `/api/version` and shows it in the sidebar footer for logged-in users.

Before copying files, deployment asks the remote site for `http://127.0.0.1:<port>/api/version` over SSH. If the remote site already reports the same package version, deployment fails and asks for a version bump. If an older site does not have `/api/version` yet, deployment continues.

The deploy command runs local verification and build once:

```bash
npm run check
npm run test
npm run build
```

Then it copies the release to:

```text
/opt/web-ui-task-manager/releases/<release-id>
```

The release contains the built app plus `package.json` and `package-lock.json`; the remote host then runs `npm ci --omit=dev` inside that release.

The service runs from:

```text
/opt/web-ui-task-manager/current
```

Persistent site data stays under:

```text
/opt/web-ui-task-manager/shared
```

### Deploy all configured sites

```bash
npm run deploy
```

Sites are deployed sequentially in the order listed by `DEPLOY_SITES`. Local check, test, build, and release staging run once, then the same release is reused for each configured site.

### Remote environment

On first install, deployment creates this file only if it does not already exist:

```text
/opt/web-ui-task-manager/shared/.env
```

The default database path is:

```text
/opt/web-ui-task-manager/shared/data/task-manager.sqlite
```

Edit the remote `.env` directly for site-specific settings.

### Rollback

SSH to the host and repoint `current` to a previous release:

```bash
cd /opt/web-ui-task-manager
ls -1dt releases/*
previous_release=/opt/web-ui-task-manager/releases/<previous-release>
ln -sfn "$previous_release" current.next
mv -Tf current.next current
sudo systemctl restart web-ui-task-manager
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```
