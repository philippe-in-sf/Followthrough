# Linux SSH Deployment Design

## Purpose

Create a repeatable deployment path for pushing app changes to Linux hosts over SSH. The deployment must update application code, preserve site-specific data/configuration, restart the service through `systemd`, and verify the app is healthy after each push.

## Decisions

- Deployment target: Linux hosts reachable over SSH.
- Process manager: `systemd`.
- Remote privilege model: SSH user has passwordless `sudo` for service installation and restart.
- Deployment transport: `rsync` over SSH.
- Build location: local development machine.
- Runtime layout: immutable release directories with a `current` symlink.
- Persistent data/configuration: remote `shared` directory outside release directories.
- Health check: local host check against `/api/health` after restart.
- Rollback foundation: keep previous release directories and switch `current` back when needed.

## Architecture

The deployment system will live under `deploy/` and will use shell scripts plus plain environment configuration. The local machine remains the source of truth for build and verification. Each target host receives a prepared release directory, installs production dependencies, atomically points the app service at the new release, restarts `systemd`, and verifies the health endpoint.

The app itself remains a single Express production process serving both API routes and the built frontend. SQLite migrations continue to run on app startup through the existing database open path. The deployment path will not copy or overwrite live SQLite databases.

## Remote Filesystem Layout

Each host will use this default layout:

```text
/opt/web-ui-task-manager/
  current -> /opt/web-ui-task-manager/releases/<release-id>
  releases/
    <release-id>/
      dist/
      package.json
      package-lock.json
      node_modules/
  shared/
    .env
    data/
      task-manager.sqlite
```

The `current` symlink is the only path the `systemd` service needs to execute. The `shared` directory stores state that survives every deployment. The `.env` file is host-owned so site-specific ports, database paths, cookie settings, and alert windows do not need to be baked into releases.

## Configuration

Deployment configuration will be local and ignored by git, with an example committed for reference.

The example file will document:

- A list of site names.
- Per-site SSH destination, such as `deploy@example.com`.
- Per-site application root, defaulting to `/opt/web-ui-task-manager`.
- Per-site service name, defaulting to `web-ui-task-manager`.
- Per-site port used for the post-restart health check, defaulting to `3000`.
- Optional retention count for old releases.

The deployment scripts will fail fast when required site configuration is missing rather than guessing. The world has suffered enough from scripts that guess.

## Deployment Flow

For a single site:

1. Validate the requested site exists in local deploy configuration.
2. Run local verification: type checks, tests, and production build.
3. Create a release identifier from UTC timestamp and short Git SHA when available.
4. Create a local staging directory containing only runtime files:
   - `dist/`
   - `package.json`
   - `package-lock.json`
5. Ensure the remote app layout exists.
6. Copy the staged release to `releases/<release-id>` with `rsync`.
7. Run `npm ci --omit=dev` inside the remote release.
8. Ensure `shared/data` exists on the remote host.
9. Ensure a remote `.env` exists, creating a conservative default only on first install.
10. Atomically update `current` to the new release.
11. Restart the `systemd` service with passwordless `sudo`.
12. Check `http://127.0.0.1:<port>/api/health` on the remote host.
13. Remove old releases beyond the configured retention count.

For all sites, the same flow runs sequentially per site. Sequential deployment keeps failures clear and avoids spreading a broken release everywhere at once, which is bold but not admirable.

## Service Installation

A separate install script will install or update the Linux `systemd` service on one target host. It will:

- Create the remote app directories.
- Install a service unit at `/etc/systemd/system/web-ui-task-manager.service` by default.
- Configure the service to run from `/opt/web-ui-task-manager/current`.
- Load environment variables from `/opt/web-ui-task-manager/shared/.env`.
- Restart on failure.
- Run `systemctl daemon-reload`.
- Enable the service.

The service unit will run `node dist/server/index.js` from the `current` directory. The script will assume Node.js 24 or newer is already installed on the target host and available in the service `PATH`.

## Data Safety

The deployment path must never delete or overwrite:

- `/opt/web-ui-task-manager/shared/.env`
- `/opt/web-ui-task-manager/shared/data/`
- Any SQLite database or SQLite sidecar files under `shared/data`

Releases are disposable. Shared data is not. This is not philosophy; it is how we avoid turning deploys into accidental data-loss pageantry.

## Error Handling

Every deploy command will run with strict shell settings. A failed local verification, failed copy, failed dependency install, failed service restart, or failed health check will stop the deploy immediately.

If a failure happens before the `current` symlink changes, the running service remains untouched. If a failure happens after restart, the old release remains available for a manual or scripted rollback by repointing `current` and restarting the service.

## Testing

The deployment scripts will be structured so the configuration parsing and generated remote command text can be tested without connecting to a real host. The implementation should add focused tests for:

- Required site configuration validation.
- Default values for app root, service name, port, and release retention.
- Runtime file list used for staging.
- Remote command generation avoids deleting shared data.

The existing verification commands remain part of deployment:

```bash
npm run check
npm run test
npm run build
```

## Documentation

The README will gain a Linux SSH deployment section covering:

- Remote prerequisites.
- Local configuration file setup.
- First-time service installation.
- Deploying one site.
- Deploying all sites.
- Where persistent data lives.
- Basic rollback procedure.
