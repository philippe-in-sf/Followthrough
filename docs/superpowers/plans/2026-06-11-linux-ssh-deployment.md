# Linux SSH Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable SSH deployment path for Linux hosts running the app under `systemd`.

**Architecture:** Add shell entrypoints in `deploy/` that invoke small TypeScript deployment helpers through `tsx`. The helpers parse site configuration, generate remote commands, create release identifiers, and render the `systemd` unit so the dangerous pieces can be tested locally before any host is touched. Runtime releases are copied to `/opt/web-ui-task-manager/releases/<release-id>`, persistent data stays under `/opt/web-ui-task-manager/shared`, and `current` is switched atomically before restarting the service.

**Tech Stack:** Bash entrypoints, TypeScript helper modules, Node.js child process APIs, SSH, rsync, npm, systemd, Vitest.

---

## File Structure

- Create `deploy/lib/config.ts`: parse deploy site configuration from environment variables.
- Create `deploy/lib/shell.ts`: quote shell values safely for generated remote commands.
- Create `deploy/lib/release.ts`: define runtime paths and release identifiers.
- Create `deploy/lib/systemd.ts`: render the Linux `systemd` unit.
- Create `deploy/lib/remoteCommands.ts`: generate remote setup, symlink, restart, health-check, and cleanup commands.
- Create `deploy/scripts/deploy.ts`: orchestrate local verification, staging, rsync, remote install, service restart, and health check.
- Create `deploy/scripts/install-systemd.ts`: install or update the remote `systemd` service.
- Create `deploy/deploy.sh`: user-facing deployment shell entrypoint.
- Create `deploy/install-systemd.sh`: user-facing service-install shell entrypoint.
- Create `deploy/sites.example.env`: documented local site configuration example.
- Create `deploy/web-ui-task-manager.service`: service template/reference for Linux hosts.
- Create `tests/deploy/config.test.ts`: unit tests for deploy config parsing.
- Create `tests/deploy/release.test.ts`: unit tests for release identifiers and staging paths.
- Create `tests/deploy/remote-commands.test.ts`: unit tests for shell quoting, systemd rendering, and remote command safety.
- Modify `.gitignore`: ignore local deploy config.
- Modify `package.json`: add deploy convenience scripts.
- Modify `tsconfig.test.json`: include `deploy` TypeScript files in local type checks.
- Modify `README.md`: document Linux SSH deployment and rollback.

Existing untracked files under `deploy/`, including `deploy/com.philippe.web-ui-task-manager.plist`, are local work from before this plan. Do not remove them and do not stage them unless the user explicitly asks.

---

### Task 1: Deploy Configuration Parser

**Files:**
- Create: `deploy/lib/config.ts`
- Create: `tests/deploy/config.test.ts`
- Modify: `.gitignore`
- Modify: `tsconfig.test.json`

- [ ] **Step 1: Write the failing config parser tests**

Create `tests/deploy/config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseDeployConfig, parseDeploySite } from "../../deploy/lib/config";

describe("deploy config", () => {
  it("parses a site with defaults", () => {
    const site = parseDeploySite(
      {
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      },
      "production",
    );

    expect(site).toEqual({
      name: "production",
      envPrefix: "DEPLOY_PRODUCTION_",
      ssh: "deploy@example.com",
      appRoot: "/opt/web-ui-task-manager",
      serviceName: "web-ui-task-manager",
      port: 3000,
      keepReleases: 5,
    });
  });

  it("parses explicit per-site values", () => {
    const site = parseDeploySite(
      {
        DEPLOY_OFFICE_SSH: "app@office.example.com",
        DEPLOY_OFFICE_APP_ROOT: "/srv/tasks",
        DEPLOY_OFFICE_SERVICE_NAME: "tasks-office",
        DEPLOY_OFFICE_PORT: "4300",
        DEPLOY_OFFICE_KEEP_RELEASES: "8",
      },
      "office",
    );

    expect(site).toEqual({
      name: "office",
      envPrefix: "DEPLOY_OFFICE_",
      ssh: "app@office.example.com",
      appRoot: "/srv/tasks",
      serviceName: "tasks-office",
      port: 4300,
      keepReleases: 8,
    });
  });

  it("parses the configured site list in order", () => {
    const config = parseDeployConfig({
      DEPLOY_SITES: "production, office",
      DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      DEPLOY_OFFICE_SSH: "app@office.example.com",
    });

    expect(config.sites.map((site) => site.name)).toEqual(["production", "office"]);
  });

  it("rejects missing site list", () => {
    expect(() => parseDeployConfig({})).toThrow(/DEPLOY_SITES/);
  });

  it("rejects missing SSH destination", () => {
    expect(() => parseDeploySite({}, "production")).toThrow(/DEPLOY_PRODUCTION_SSH/);
  });

  it("rejects unsafe site names", () => {
    expect(() => parseDeploySite({ DEPLOY_BAD_SITE_SSH: "deploy@example.com" }, "bad-site")).toThrow(
      /letters, numbers, and underscores/,
    );
  });

  it("rejects invalid numeric values", () => {
    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_PORT: "abc",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_PORT/);

    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_KEEP_RELEASES: "0",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_KEEP_RELEASES/);
  });
});
```

- [ ] **Step 2: Run the config parser test to verify it fails**

Run:

```bash
npm run test -- tests/deploy/config.test.ts
```

Expected: FAIL because `../../deploy/lib/config` does not exist.

- [ ] **Step 3: Implement the config parser**

Create `deploy/lib/config.ts`:

```typescript
export type DeploySite = {
  name: string;
  envPrefix: string;
  ssh: string;
  appRoot: string;
  serviceName: string;
  port: number;
  keepReleases: number;
};

export type DeployConfig = {
  sites: DeploySite[];
};

type EnvMap = Record<string, string | undefined>;

const DEFAULT_APP_ROOT = "/opt/web-ui-task-manager";
const DEFAULT_SERVICE_NAME = "web-ui-task-manager";
const DEFAULT_PORT = 3000;
const DEFAULT_KEEP_RELEASES = 5;
const SITE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

function envPrefixForSite(siteName: string) {
  if (!SITE_NAME_PATTERN.test(siteName)) {
    throw new Error(`Deploy site names may only contain letters, numbers, and underscores: ${siteName}`);
  }

  return `DEPLOY_${siteName.toUpperCase()}_`;
}

function required(env: EnvMap, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required deploy config value: ${key}`);
  return value;
}

function positiveInteger(env: EnvMap, key: string, fallback: number) {
  const rawValue = env[key]?.trim();
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Deploy config value ${key} must be a positive integer`);
  }

  return value;
}

export function parseDeploySite(env: EnvMap, siteName: string): DeploySite {
  const name = siteName.trim();
  if (!name) throw new Error("Deploy site name cannot be empty");

  const envPrefix = envPrefixForSite(name);

  return {
    name,
    envPrefix,
    ssh: required(env, `${envPrefix}SSH`),
    appRoot: env[`${envPrefix}APP_ROOT`]?.trim() || DEFAULT_APP_ROOT,
    serviceName: env[`${envPrefix}SERVICE_NAME`]?.trim() || DEFAULT_SERVICE_NAME,
    port: positiveInteger(env, `${envPrefix}PORT`, DEFAULT_PORT),
    keepReleases: positiveInteger(env, `${envPrefix}KEEP_RELEASES`, DEFAULT_KEEP_RELEASES),
  };
}

export function parseDeployConfig(env: EnvMap = process.env): DeployConfig {
  const rawSites = required(env, "DEPLOY_SITES");
  const siteNames = rawSites
    .split(",")
    .map((siteName) => siteName.trim())
    .filter(Boolean);

  if (siteNames.length === 0) {
    throw new Error("DEPLOY_SITES must include at least one site name");
  }

  return {
    sites: siteNames.map((siteName) => parseDeploySite(env, siteName)),
  };
}

export function findDeploySite(config: DeployConfig, siteName: string): DeploySite {
  const site = config.sites.find((candidate) => candidate.name === siteName);
  if (!site) {
    throw new Error(`Unknown deploy site "${siteName}". Available sites: ${config.sites.map((candidate) => candidate.name).join(", ")}`);
  }

  return site;
}
```

- [ ] **Step 4: Ignore local deploy config**

Modify `.gitignore` by adding these lines:

```gitignore
deploy/sites.env
deploy/sites.*.env
!deploy/sites.example.env
```

- [ ] **Step 5: Include deploy TypeScript in test type checks**

Modify `tsconfig.test.json` so the `include` array is:

```json
["tests", "src", "server", "shared", "deploy", "vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 6: Run the config parser test to verify it passes**

Run:

```bash
npm run test -- tests/deploy/config.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add .gitignore tsconfig.test.json deploy/lib/config.ts tests/deploy/config.test.ts
git commit -m "feat: parse deployment site config"
```

---

### Task 2: Release Metadata and Runtime File List

**Files:**
- Create: `deploy/lib/release.ts`
- Create: `tests/deploy/release.test.ts`

- [ ] **Step 1: Write the failing release tests**

Create `tests/deploy/release.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createReleaseId, runtimePaths } from "../../deploy/lib/release";

describe("deployment releases", () => {
  it("lists only runtime paths needed by the server", () => {
    expect(runtimePaths).toEqual(["dist", "package.json", "package-lock.json"]);
  });

  it("creates a timestamp release id without a git sha", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"))).toBe("20260611T181920Z");
  });

  it("appends a short git sha when available", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"), "abcdef1234567890")).toBe(
      "20260611T181920Z-abcdef1",
    );
  });

  it("removes unsafe characters from the git sha", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"), "abc/def xyz")).toBe(
      "20260611T181920Z-abcdefx",
    );
  });
});
```

- [ ] **Step 2: Run the release test to verify it fails**

Run:

```bash
npm run test -- tests/deploy/release.test.ts
```

Expected: FAIL because `../../deploy/lib/release` does not exist.

- [ ] **Step 3: Implement release helpers**

Create `deploy/lib/release.ts`:

```typescript
export const runtimePaths = ["dist", "package.json", "package-lock.json"] as const;

function timestampPart(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function shortShaPart(gitSha: string) {
  return gitSha.replace(/[^A-Za-z0-9]/g, "").slice(0, 7);
}

export function createReleaseId(date = new Date(), gitSha = "") {
  const cleanedSha = shortShaPart(gitSha);
  return cleanedSha ? `${timestampPart(date)}-${cleanedSha}` : timestampPart(date);
}
```

- [ ] **Step 4: Run the release test to verify it passes**

Run:

```bash
npm run test -- tests/deploy/release.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add deploy/lib/release.ts tests/deploy/release.test.ts
git commit -m "feat: define deployment release metadata"
```

---

### Task 3: Remote Command Rendering

**Files:**
- Create: `deploy/lib/shell.ts`
- Create: `deploy/lib/systemd.ts`
- Create: `deploy/lib/remoteCommands.ts`
- Create: `tests/deploy/remote-commands.test.ts`

- [ ] **Step 1: Write failing remote command tests**

Create `tests/deploy/remote-commands.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { DeploySite } from "../../deploy/lib/config";
import {
  buildCleanupCommand,
  buildEnsureLayoutCommand,
  buildHealthCheckCommand,
  buildInstallDependenciesCommand,
  buildRestartCommand,
  buildSwitchCurrentCommand,
} from "../../deploy/lib/remoteCommands";
import { quoteShell } from "../../deploy/lib/shell";
import { renderSystemdUnit } from "../../deploy/lib/systemd";

const site: DeploySite = {
  name: "production",
  envPrefix: "DEPLOY_PRODUCTION_",
  ssh: "deploy@example.com",
  appRoot: "/opt/web-ui-task-manager",
  serviceName: "web-ui-task-manager",
  port: 3000,
  keepReleases: 5,
};

describe("shell quoting", () => {
  it("single-quotes values and escapes embedded single quotes", () => {
    expect(quoteShell("/opt/weird app/root")).toBe("'/opt/weird app/root'");
    expect(quoteShell("can't")).toBe("'can'\"'\"'t'");
  });
});

describe("systemd unit rendering", () => {
  it("runs the app from the current release and loads shared env", () => {
    expect(renderSystemdUnit(site)).toContain("WorkingDirectory=/opt/web-ui-task-manager/current");
    expect(renderSystemdUnit(site)).toContain("EnvironmentFile=/opt/web-ui-task-manager/shared/.env");
    expect(renderSystemdUnit(site)).toContain("ExecStart=/usr/bin/env node dist/server/index.js");
    expect(renderSystemdUnit(site)).toContain("Restart=on-failure");
  });
});

describe("remote command rendering", () => {
  it("ensures shared data without overwriting the shared env file", () => {
    const command = buildEnsureLayoutCommand(site);

    expect(command).toContain("mkdir -p");
    expect(command).toContain("/opt/web-ui-task-manager/shared/data");
    expect(command).toContain("if [ ! -f '/opt/web-ui-task-manager/shared/.env' ]; then");
    expect(command).toContain("DATABASE_PATH=/opt/web-ui-task-manager/shared/data/task-manager.sqlite");
    expect(command).not.toContain("rm -rf '/opt/web-ui-task-manager/shared");
  });

  it("installs production dependencies inside a release", () => {
    expect(buildInstallDependenciesCommand(site, "20260611T181920Z")).toContain(
      "cd '/opt/web-ui-task-manager/releases/20260611T181920Z'",
    );
    expect(buildInstallDependenciesCommand(site, "20260611T181920Z")).toContain("npm ci --omit=dev");
  });

  it("switches current with an atomic symlink move", () => {
    const command = buildSwitchCurrentCommand(site, "20260611T181920Z");

    expect(command).toContain("ln -sfn '/opt/web-ui-task-manager/releases/20260611T181920Z' '/opt/web-ui-task-manager/current.next'");
    expect(command).toContain("mv -Tf '/opt/web-ui-task-manager/current.next' '/opt/web-ui-task-manager/current'");
  });

  it("restarts the configured service with sudo", () => {
    expect(buildRestartCommand(site)).toBe("sudo systemctl restart 'web-ui-task-manager'");
  });

  it("checks health on localhost using the configured port", () => {
    expect(buildHealthCheckCommand(site)).toContain("curl --fail --silent --show-error 'http://127.0.0.1:3000/api/health'");
  });

  it("cleans old releases without deleting current or shared data", () => {
    const command = buildCleanupCommand(site);

    expect(command).toContain("readlink '/opt/web-ui-task-manager/current'");
    expect(command).toContain("tail -n +6");
    expect(command).not.toContain("shared");
    expect(command).not.toContain("rm -rf '/opt/web-ui-task-manager'");
  });
});
```

- [ ] **Step 2: Run the remote command test to verify it fails**

Run:

```bash
npm run test -- tests/deploy/remote-commands.test.ts
```

Expected: FAIL because the remote command modules do not exist.

- [ ] **Step 3: Implement shell quoting**

Create `deploy/lib/shell.ts`:

```typescript
export function quoteShell(value: string | number) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}
```

- [ ] **Step 4: Implement systemd unit rendering**

Create `deploy/lib/systemd.ts`:

```typescript
import type { DeploySite } from "./config";

export function renderSystemdUnit(site: DeploySite) {
  return `[Unit]
Description=Web UI Task Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=${site.appRoot}/current
EnvironmentFile=${site.appRoot}/shared/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/env node dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}
```

- [ ] **Step 5: Implement remote command rendering**

Create `deploy/lib/remoteCommands.ts`:

```typescript
import type { DeploySite } from "./config";
import { quoteShell } from "./shell";

export function buildEnsureLayoutCommand(site: DeploySite) {
  const appRoot = quoteShell(site.appRoot);
  const releasesDir = quoteShell(`${site.appRoot}/releases`);
  const sharedDir = quoteShell(`${site.appRoot}/shared`);
  const dataDir = quoteShell(`${site.appRoot}/shared/data`);
  const envFile = quoteShell(`${site.appRoot}/shared/.env`);
  const defaultDatabasePath = `${site.appRoot}/shared/data/task-manager.sqlite`;

  return [
    "set -euo pipefail",
    `sudo mkdir -p ${releasesDir} ${dataDir}`,
    `sudo chown -R "$USER":"$USER" ${appRoot}`,
    `if [ ! -f ${envFile} ]; then`,
    `  cat > ${envFile} <<'ENV'`,
    `PORT=${site.port}`,
    `DATABASE_PATH=${defaultDatabasePath}`,
    "SESSION_COOKIE_NAME=tm_session",
    "SESSION_TTL_DAYS=14",
    "DUE_SOON_DAYS=7",
    "ENV",
    "fi",
    `mkdir -p ${sharedDir} ${dataDir}`,
  ].join("\n");
}

export function buildInstallDependenciesCommand(site: DeploySite, releaseId: string) {
  const releaseDir = quoteShell(`${site.appRoot}/releases/${releaseId}`);

  return [
    "set -euo pipefail",
    `cd ${releaseDir}`,
    "npm ci --omit=dev",
  ].join("\n");
}

export function buildSwitchCurrentCommand(site: DeploySite, releaseId: string) {
  const releaseDir = quoteShell(`${site.appRoot}/releases/${releaseId}`);
  const nextLink = quoteShell(`${site.appRoot}/current.next`);
  const currentLink = quoteShell(`${site.appRoot}/current`);

  return [
    "set -euo pipefail",
    `ln -sfn ${releaseDir} ${nextLink}`,
    `mv -Tf ${nextLink} ${currentLink}`,
  ].join("\n");
}

export function buildRestartCommand(site: DeploySite) {
  return `sudo systemctl restart ${quoteShell(site.serviceName)}`;
}

export function buildHealthCheckCommand(site: DeploySite) {
  const url = quoteShell(`http://127.0.0.1:${site.port}/api/health`);

  return [
    "set -euo pipefail",
    `curl --fail --silent --show-error ${url}`,
  ].join("\n");
}

export function buildCleanupCommand(site: DeploySite) {
  const releasesDir = quoteShell(`${site.appRoot}/releases`);
  const currentLink = quoteShell(`${site.appRoot}/current`);

  return [
    "set -euo pipefail",
    `current_target="$(readlink ${currentLink} || true)"`,
    `cd ${releasesDir}`,
    `ls -1dt -- */ | sed 's#/$##' | tail -n +${site.keepReleases + 1} | while IFS= read -r release; do`,
    "  [ -n \"$release\" ] || continue",
    "  release_path=\"$PWD/$release\"",
    "  if [ \"$release_path\" != \"$current_target\" ]; then",
    "    rm -rf -- \"$release_path\"",
    "  fi",
    "done",
  ].join("\n");
}
```

- [ ] **Step 6: Run the remote command test to verify it passes**

Run:

```bash
npm run test -- tests/deploy/remote-commands.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add deploy/lib/shell.ts deploy/lib/systemd.ts deploy/lib/remoteCommands.ts tests/deploy/remote-commands.test.ts
git commit -m "feat: render deployment remote commands"
```

---

### Task 4: Deployment Runner and Entry Point

**Files:**
- Create: `deploy/scripts/deploy.ts`
- Create: `deploy/deploy.sh`
- Create: `deploy/sites.example.env`
- Modify: `package.json`

- [ ] **Step 1: Write the deploy runner**

Create `deploy/scripts/deploy.ts`:

```typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findDeploySite, parseDeployConfig, type DeploySite } from "../lib/config";
import {
  buildCleanupCommand,
  buildEnsureLayoutCommand,
  buildHealthCheckCommand,
  buildInstallDependenciesCommand,
  buildRestartCommand,
  buildSwitchCurrentCommand,
} from "../lib/remoteCommands";
import { createReleaseId, runtimePaths } from "../lib/release";

function run(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function capture(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function remote(site: DeploySite, command: string) {
  run("ssh", [site.ssh, "bash", "-lc", command]);
}

function stageRelease(releaseId: string) {
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-ui-task-manager-release-"));
  const releaseDir = path.join(stageRoot, releaseId);
  fs.mkdirSync(releaseDir, { recursive: true });

  for (const runtimePath of runtimePaths) {
    fs.cpSync(runtimePath, path.join(releaseDir, runtimePath), {
      recursive: true,
      dereference: false,
    });
  }

  return { stageRoot, releaseDir };
}

function deploySite(site: DeploySite) {
  console.log(`Deploying ${site.name} to ${site.ssh}`);

  run("npm", ["run", "check"]);
  run("npm", ["run", "test"]);
  run("npm", ["run", "build"]);

  const releaseId = createReleaseId(new Date(), capture("git", ["rev-parse", "--short", "HEAD"]));
  const { stageRoot, releaseDir } = stageRelease(releaseId);
  const remoteReleaseDir = `${site.appRoot}/releases/`;

  try {
    remote(site, buildEnsureLayoutCommand(site));
    run("rsync", ["-az", "--delete", `${releaseDir}/`, `${site.ssh}:${remoteReleaseDir}${releaseId}/`]);
    remote(site, buildInstallDependenciesCommand(site, releaseId));
    remote(site, buildSwitchCurrentCommand(site, releaseId));
    remote(site, buildRestartCommand(site));
    remote(site, buildHealthCheckCommand(site));
    remote(site, buildCleanupCommand(site));
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }

  console.log(`Deployed ${site.name} release ${releaseId}`);
}

function main() {
  const [, , target = "all"] = process.argv;
  const config = parseDeployConfig();
  const sites = target === "all" ? config.sites : [findDeploySite(config, target)];

  for (const site of sites) {
    deploySite(site);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
```

- [ ] **Step 2: Write the shell entrypoint**

Create `deploy/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

config_file="${DEPLOY_CONFIG:-deploy/sites.env}"

if [ ! -f "$config_file" ]; then
  echo "Missing deploy config: $config_file" >&2
  echo "Copy deploy/sites.example.env to $config_file and edit it for your hosts." >&2
  exit 1
fi

set -a
source "$config_file"
set +a

npx tsx deploy/scripts/deploy.ts "${1:-all}"
```

- [ ] **Step 3: Write the example deploy config**

Create `deploy/sites.example.env`:

```bash
# Copy this file to deploy/sites.env and edit values for your Linux hosts.
# Site names may contain letters, numbers, and underscores.

DEPLOY_SITES=production

DEPLOY_PRODUCTION_SSH=deploy@example.com
DEPLOY_PRODUCTION_APP_ROOT=/opt/web-ui-task-manager
DEPLOY_PRODUCTION_SERVICE_NAME=web-ui-task-manager
DEPLOY_PRODUCTION_PORT=3000
DEPLOY_PRODUCTION_KEEP_RELEASES=5
```

- [ ] **Step 4: Add the deploy package script**

Modify the `scripts` object in `package.json` so it includes these entries:

```json
"deploy": "bash deploy/deploy.sh"
```

Keep the existing scripts unchanged.

- [ ] **Step 5: Make the deploy entrypoint executable**

Run:

```bash
chmod +x deploy/deploy.sh
```

Expected: command exits successfully.

- [ ] **Step 6: Run focused deploy tests**

Run:

```bash
npm run test -- tests/deploy/config.test.ts tests/deploy/release.test.ts tests/deploy/remote-commands.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add package.json deploy/scripts/deploy.ts deploy/deploy.sh deploy/sites.example.env
git commit -m "feat: add ssh deployment runner"
```

---

### Task 5: Systemd Installer and Service Template

**Files:**
- Create: `deploy/scripts/install-systemd.ts`
- Create: `deploy/install-systemd.sh`
- Create: `deploy/web-ui-task-manager.service`
- Modify: `package.json`
- Modify: `tests/deploy/remote-commands.test.ts`

- [ ] **Step 1: Extend the systemd rendering test**

Modify `tests/deploy/remote-commands.test.ts` by replacing the `systemd unit rendering` test with:

```typescript
describe("systemd unit rendering", () => {
  it("runs the app from the current release and loads shared env", () => {
    const unit = renderSystemdUnit(site);

    expect(unit).toContain("WorkingDirectory=/opt/web-ui-task-manager/current");
    expect(unit).toContain("EnvironmentFile=/opt/web-ui-task-manager/shared/.env");
    expect(unit).toContain("ExecStart=/usr/bin/env node dist/server/index.js");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("WantedBy=multi-user.target");
  });
});
```

- [ ] **Step 2: Run the remote command test**

Run:

```bash
npm run test -- tests/deploy/remote-commands.test.ts
```

Expected: PASS because the existing unit renderer already includes the required systemd fields.

- [ ] **Step 3: Write the systemd installer**

Create `deploy/scripts/install-systemd.ts`:

```typescript
import { spawnSync } from "node:child_process";
import { findDeploySite, parseDeployConfig, type DeploySite } from "../lib/config";
import { buildEnsureLayoutCommand } from "../lib/remoteCommands";
import { quoteShell } from "../lib/shell";
import { renderSystemdUnit } from "../lib/systemd";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function remote(site: DeploySite, command: string) {
  run("ssh", [site.ssh, "bash", "-lc", command]);
}

function installSystemd(site: DeploySite) {
  const unitPath = `/etc/systemd/system/${site.serviceName}.service`;
  const unit = renderSystemdUnit(site);
  const installCommand = [
    "set -euo pipefail",
    buildEnsureLayoutCommand(site),
    `cat > /tmp/${site.serviceName}.service <<'UNIT'`,
    unit.trimEnd(),
    "UNIT",
    `sudo mv ${quoteShell(`/tmp/${site.serviceName}.service`)} ${quoteShell(unitPath)}`,
    `sudo systemctl daemon-reload`,
    `sudo systemctl enable ${quoteShell(site.serviceName)}`,
  ].join("\n");

  console.log(`Installing systemd service ${site.serviceName} on ${site.ssh}`);
  remote(site, installCommand);
}

function main() {
  const [, , siteName] = process.argv;
  if (!siteName) {
    throw new Error("Usage: deploy/install-systemd.sh <site>");
  }

  const site = findDeploySite(parseDeployConfig(), siteName);
  installSystemd(site);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
```

- [ ] **Step 4: Write the systemd installer entrypoint**

Create `deploy/install-systemd.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

config_file="${DEPLOY_CONFIG:-deploy/sites.env}"

if [ ! -f "$config_file" ]; then
  echo "Missing deploy config: $config_file" >&2
  echo "Copy deploy/sites.example.env to $config_file and edit it for your hosts." >&2
  exit 1
fi

set -a
source "$config_file"
set +a

npx tsx deploy/scripts/install-systemd.ts "$@"
```

- [ ] **Step 5: Add the service template reference**

Create `deploy/web-ui-task-manager.service`:

```ini
[Unit]
Description=Web UI Task Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/web-ui-task-manager/current
EnvironmentFile=/opt/web-ui-task-manager/shared/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/env node dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 6: Add the installer package script**

Modify the `scripts` object in `package.json` so it includes this entry:

```json
"deploy:install-systemd": "bash deploy/install-systemd.sh"
```

Keep the existing scripts unchanged.

- [ ] **Step 7: Make the installer entrypoint executable**

Run:

```bash
chmod +x deploy/install-systemd.sh
```

Expected: command exits successfully.

- [ ] **Step 8: Run focused deploy tests**

Run:

```bash
npm run test -- tests/deploy/config.test.ts tests/deploy/release.test.ts tests/deploy/remote-commands.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

Run:

```bash
git add package.json deploy/scripts/install-systemd.ts deploy/install-systemd.sh deploy/web-ui-task-manager.service tests/deploy/remote-commands.test.ts
git commit -m "feat: add systemd deployment installer"
```

---

### Task 6: Deployment Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the Linux SSH deployment docs**

Append this section to `README.md`:

```markdown
## Linux SSH Deployment

The app can be deployed to Linux hosts over SSH and run with `systemd`. The deployment path builds locally, pushes a release directory with `rsync`, keeps site data in a shared directory, restarts the service, and checks `/api/health`.

### Remote prerequisites

- Linux host reachable over SSH
- Node.js 24 or newer
- npm
- rsync
- curl
- systemd
- SSH user with passwordless `sudo` for `systemctl` and writing `/etc/systemd/system`

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
```

`deploy/sites.env` is ignored by git because it is local machine configuration.

### First-time service install

```bash
npm run deploy:install-systemd -- production
```

This creates the remote app layout, installs `/etc/systemd/system/web-ui-task-manager.service`, runs `systemctl daemon-reload`, and enables the service.

### Deploy one site

```bash
npm run deploy -- production
```

The deploy command runs:

```bash
npm run check
npm run test
npm run build
```

Then it copies the release to:

```text
/opt/web-ui-task-manager/releases/<release-id>
```

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

Sites are deployed sequentially in the order listed by `DEPLOY_SITES`.

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
ln -sfn /opt/web-ui-task-manager/releases/<previous-release> current.next
mv -Tf current.next current
sudo systemctl restart web-ui-task-manager
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```
```

- [ ] **Step 2: Run README grep checks**

Run:

```bash
rg -n "Linux SSH Deployment|deploy:install-systemd|npm run deploy|Rollback" README.md
```

Expected: output includes lines for the new deployment section, first-time install command, deploy command, and rollback heading.

- [ ] **Step 3: Commit Task 6**

Run:

```bash
git add README.md
git commit -m "docs: document linux ssh deployment"
```

---

### Task 7: Full Verification

**Files:**
- Verify: all deployment files and existing app files

- [ ] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 2: Run type checks**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS and `dist/` is generated.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or untracked. Existing unrelated untracked `deploy/` files from before this work must not be removed or staged.

- [ ] **Step 5: Final implementation commit if any files remain uncommitted**

If `git status --short` shows intentional deployment changes after the task commits, run:

```bash
git add .gitignore package.json tsconfig.test.json README.md \
  deploy/lib/config.ts deploy/lib/release.ts deploy/lib/shell.ts deploy/lib/systemd.ts deploy/lib/remoteCommands.ts \
  deploy/scripts/deploy.ts deploy/scripts/install-systemd.ts \
  deploy/deploy.sh deploy/install-systemd.sh deploy/sites.example.env deploy/web-ui-task-manager.service \
  tests/deploy/config.test.ts tests/deploy/release.test.ts tests/deploy/remote-commands.test.ts
git commit -m "feat: add linux ssh deployment path"
```

Expected: commit succeeds, or there is nothing left to commit.
