# Visible Version Implementation Plan

## Goal

Show the current app version in the authenticated UI, expose it through a lightweight public endpoint, and prevent deploying the same version over a site that already reports it.

## Decisions

- `package.json` is the single version source.
- The UI displays `Version x.y.z` in the sidebar footer.
- `GET /api/version` returns `{ "version": "x.y.z" }` without authentication.
- Deploy compares the local package version with the remote `/api/version` response before copying files. Matching versions fail the deploy; missing old endpoints are allowed so the first deploy after this change can still proceed.
- Version bumps are explicit through `npm run version:patch`, which runs `npm version patch --no-git-tag-version`.

## Implementation Steps

1. Add server version endpoint and tests.

   - Add `server/version.ts` that reads `package.json` from `process.cwd()` and exports `appVersion`.
   - Register `GET /api/version` near `/api/health` in `server/app.ts`.
   - Extend `tests/server/health.test.ts` to assert the endpoint returns the current package version.

   Expected route shape:

   ```ts
   app.get("/api/version", (_req, res) => {
     res.json({ version: appVersion });
   });
   ```

2. Add client version display and tests.

   - Add `src/version.ts` that imports `version` from `package.json`.
   - Pass the version into `AppShell`.
   - Render `Version ${version}` at the bottom of the sidebar.
   - Update `tests/client/auth-shell.test.tsx` to assert the visible version.
   - Add CSS so the label is quiet and anchored below navigation.

3. Add version bump command.

   - Add `version:patch` to `package.json`.
   - Run it once for this deployment so package metadata moves from `1.0.0` to `1.0.1`.
   - Commit both `package.json` and `package-lock.json`.

4. Add deploy duplicate-version guard.

   - Add a remote command that fetches `http://127.0.0.1:${site.port}/api/version`.
   - Add a capturing SSH helper in `deploy/scripts/deploy.ts`.
   - If the remote endpoint returns the same version as the local package, fail before `rsync`.
   - If the endpoint is absent or unreadable, log that the guard was skipped and proceed.
   - Extend deploy runner tests for:
     - same remote version blocks before `rsync`;
     - unavailable remote version proceeds.

5. Update docs and verify.

   - Document the version bump rule in `README.md`.
   - Run:

   ```sh
   npm run check
   npm run test
   npm run build
   ```

   - After merge, deploy with the existing SSH deployment path and verify:

   ```sh
   curl --fail --silent --show-error https://philippe-tasks.net/api/version
   ```
