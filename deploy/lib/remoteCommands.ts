import type { DeploySite } from "./config";
import { quoteShell } from "./shell";

const PROTECTED_APP_ROOTS = new Set(["/", "/opt", "/srv"]);

function validateAppRoot(appRoot: string) {
  if (!appRoot.startsWith("/")) {
    throw new Error(`Invalid deploy appRoot: must be an absolute path, got ${appRoot}`);
  }

  const comparableRoot = appRoot.replace(/\/+$/, "") || "/";
  if (PROTECTED_APP_ROOTS.has(comparableRoot)) {
    throw new Error(`Invalid deploy appRoot: refusing to deploy directly into ${appRoot}`);
  }

  if (appRoot.split("/").includes("..")) {
    throw new Error(`Invalid deploy appRoot: path segments cannot include "..", got ${appRoot}`);
  }
}

function pathsForSite(site: DeploySite) {
  validateAppRoot(site.appRoot);

  return {
    appRoot: quoteShell(site.appRoot),
    releasesDir: quoteShell(`${site.appRoot}/releases`),
    sharedDir: quoteShell(`${site.appRoot}/shared`),
    dataDir: quoteShell(`${site.appRoot}/shared/data`),
    envFile: quoteShell(`${site.appRoot}/shared/.env`),
    currentLink: quoteShell(`${site.appRoot}/current`),
  };
}

export function buildEnsureLayoutCommand(site: DeploySite) {
  const { appRoot, releasesDir, sharedDir, dataDir, envFile } = pathsForSite(site);
  const serviceIdentity = `${quoteShell(site.serviceUser)}:${quoteShell(site.serviceGroup)}`;
  const defaultDatabasePath = `${site.appRoot}/shared/data/task-manager.sqlite`;

  return [
    "set -euo pipefail",
    `sudo mkdir -p ${appRoot} ${releasesDir} ${sharedDir} ${dataDir}`,
    `sudo chown -R "$USER":"$USER" ${releasesDir}`,
    `sudo chown "$USER":"$USER" ${sharedDir}`,
    `sudo chown -R ${serviceIdentity} ${dataDir}`,
    `if [ ! -f ${envFile} ]; then`,
    `  cat > ${envFile} <<'ENV'`,
    `PORT=${site.port}`,
    `DATABASE_PATH=${defaultDatabasePath}`,
    "SESSION_COOKIE_NAME=tm_session",
    "SESSION_TTL_DAYS=14",
    "DUE_SOON_DAYS=7",
    "ENV",
    "fi",
  ].join("\n");
}

export function buildInstallDependenciesCommand(site: DeploySite, releaseId: string) {
  validateAppRoot(site.appRoot);
  const releaseDir = quoteShell(`${site.appRoot}/releases/${releaseId}`);

  return [
    "set -euo pipefail",
    `cd ${releaseDir}`,
    "npm ci --omit=dev",
  ].join("\n");
}

export function buildSwitchCurrentCommand(site: DeploySite, releaseId: string) {
  validateAppRoot(site.appRoot);
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
  validateAppRoot(site.appRoot);
  return `sudo systemctl restart ${quoteShell(site.serviceName)}`;
}

export function buildHealthCheckCommand(site: DeploySite) {
  validateAppRoot(site.appRoot);
  const url = quoteShell(`http://127.0.0.1:${site.port}/api/health`);

  return [
    "set -euo pipefail",
    `curl --fail --silent --show-error ${url}`,
  ].join("\n");
}

export function buildCleanupCommand(site: DeploySite) {
  const { releasesDir, currentLink } = pathsForSite(site);

  return [
    "set -euo pipefail",
    "canonicalize_path() {",
    "  readlink -f \"$1\" 2>/dev/null || realpath \"$1\"",
    "}",
    `current_target="$(canonicalize_path ${currentLink} || true)"`,
    `cd ${releasesDir}`,
    `ls -1dt -- */ | sed 's#/$##' | tail -n +${site.keepReleases + 1} | while IFS= read -r release; do`,
    "  [ -n \"$release\" ] || continue",
    "  release_path=\"$(canonicalize_path \"$PWD/$release\")\"",
    "  if [ \"$release_path\" != \"$current_target\" ]; then",
    "    rm -rf -- \"$release_path\"",
    "  fi",
    "done",
  ].join("\n");
}
