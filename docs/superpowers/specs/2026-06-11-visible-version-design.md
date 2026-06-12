# Visible Version Design

## Purpose

Show the deployed app version in the UI and expose it through the API so a site operator can tell at a glance which version a site is running.

## Decisions

- Source of truth: `package.json` `version`.
- Display location: persistent app shell footer/sidebar area, visible after login.
- API: unauthenticated `GET /api/version` returning `{ "version": "<package version>" }`.
- Version bumping: explicit, not automatic inside `npm run deploy`.
- Deploy guard: deployment should compare local version with the remote site's `/api/version` and refuse to deploy when they are the same.
- Initial version increment for this feature: bump patch version from `1.0.0` to `1.0.1`.

## User Experience

The app shell will show a compact footer-style label such as `Version 1.0.1`. It should be visually quiet and available from every authenticated section. The login page does not need the version in this iteration.

The label should not take attention away from navigation or user actions. It exists for quick operational confirmation, not as a feature announcement, because apparently even version numbers can develop main-character syndrome if encouraged.

## Server Behavior

The server will expose:

```http
GET /api/version
```

Response:

```json
{ "version": "1.0.1" }
```

This endpoint is public like `/api/health`, because deployment checks need it before authentication. It must read from package metadata at runtime/build time without duplicating the version string in source files.

## Client Behavior

The client should get the same version value from build-time package metadata and pass it into the shell. A small helper/module can own the imported metadata so tests and components do not care how the version is loaded.

The app shell will render the version consistently for logged-in users. If the package metadata cannot be read during development or tests, that should fail loudly at build/test time rather than silently showing a fake value.

## Version Bumping

Add an explicit command:

```bash
npm run version:patch
```

The command should update both `package.json` and `package-lock.json` using npm's version command without creating a git tag. The deploy command should not edit files.

Normal release flow:

```bash
npm run version:patch
npm run deploy -- production
```

## Deploy Guard

Before copying a release, `npm run deploy` should fetch the remote site version from:

```text
http://127.0.0.1:<port>/api/version
```

over SSH on the target host. If the remote version equals the local package version, deployment should fail with a clear message telling the user to run `npm run version:patch` first.

If the remote version endpoint is unavailable, deployment may continue. This preserves first deploys and upgrades from older versions that do not yet expose `/api/version`.

## Data Flow

```text
package.json version
  -> server /api/version response
  -> client app shell version label
  -> deploy runner local version
  -> remote pre-deploy comparison
```

## Testing

Add focused tests for:

- `/api/version` returns the package version.
- Logged-in shell renders the version label.
- `npm run version:patch` script exists and uses npm version without a git tag.
- Deploy runner refuses deployment when remote version equals local version.
- Deploy runner continues when the remote version endpoint is unavailable.

Existing full verification remains:

```bash
npm run test
npm run check
npm run build
```

## Documentation

Update README deployment instructions to mention:

- Version is visible in the app shell.
- `GET /api/version` can be used to check a site.
- Run `npm run version:patch` before deploy.
- Deploy refuses to push when the remote site already reports the same version.
