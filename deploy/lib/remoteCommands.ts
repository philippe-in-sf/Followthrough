import type { DeploySite } from "./config";
import { quoteShell } from "./shell";
import { systemdUnitName, validateDeployAppRoot } from "./validation";

const SAFE_RELEASE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function pathsForSite(site: DeploySite) {
  const appRoot = validateDeployAppRoot(site.appRoot);

  return {
    appRoot: quoteShell(appRoot),
    releasesDir: quoteShell(`${appRoot}/releases`),
    sharedDir: quoteShell(`${appRoot}/shared`),
    dataDir: quoteShell(`${appRoot}/shared/data`),
    envFile: quoteShell(`${appRoot}/shared/.env`),
    currentLink: quoteShell(`${appRoot}/current`),
    defaultDatabasePath: `${appRoot}/shared/data/task-manager.sqlite`,
  };
}

export function buildRsyncReleaseTarget(site: DeploySite, releaseId: string) {
  const appRoot = validateDeployAppRoot(site.appRoot);

  if (!SAFE_RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error(`Invalid deploy releaseId: unsafe rsync path segment, got ${releaseId}`);
  }

  return `${site.ssh}:${appRoot}/releases/${releaseId}/`;
}

export function buildEnsureLayoutCommand(site: DeploySite) {
  const { appRoot, releasesDir, sharedDir, dataDir, envFile, defaultDatabasePath } = pathsForSite(site);
  const serviceIdentity = `${quoteShell(site.serviceUser)}:${quoteShell(site.serviceGroup)}`;
  const deployIdentity = '"${deploy_user}:${deploy_group}"';

  return [
    "set -euo pipefail",
    `deploy_user="$(id -un)"`,
    `deploy_group="$(id -gn)"`,
    `sudo mkdir -p ${appRoot} ${releasesDir} ${sharedDir} ${dataDir}`,
    `sudo chown -R ${deployIdentity} ${releasesDir}`,
    `sudo chown ${deployIdentity} ${sharedDir}`,
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
  const appRoot = validateDeployAppRoot(site.appRoot);
  const releaseDir = quoteShell(`${appRoot}/releases/${releaseId}`);

  return [
    "set -euo pipefail",
    `cd ${releaseDir}`,
    "npm ci --omit=dev",
  ].join("\n");
}

export function buildSwitchCurrentCommand(site: DeploySite, releaseId: string) {
  const appRoot = validateDeployAppRoot(site.appRoot);
  const releaseDir = quoteShell(`${appRoot}/releases/${releaseId}`);
  const nextLink = quoteShell(`${appRoot}/current.next`);
  const currentLink = quoteShell(`${appRoot}/current`);

  return [
    "set -euo pipefail",
    `ln -sfn ${releaseDir} ${nextLink}`,
    `mv -Tf ${nextLink} ${currentLink}`,
  ].join("\n");
}

export function buildRestartCommand(site: DeploySite) {
  validateDeployAppRoot(site.appRoot);
  return `sudo systemctl restart -- ${quoteShell(systemdUnitName(site.serviceName))}`;
}

export function buildHealthCheckCommand(site: DeploySite) {
  validateDeployAppRoot(site.appRoot);
  const url = quoteShell(`http://127.0.0.1:${site.port}/api/health`);

  return [
    "set -euo pipefail",
    "for attempt in 1 2 3 4 5 6 7 8 9 10; do",
    `  if curl --fail --silent --show-error ${url}; then`,
    "    exit 0",
    "  fi",
    "  if [ \"$attempt\" -lt 10 ]; then",
    "    sleep 1",
    "  fi",
    "done",
    "exit 1",
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
    "  release_path=\"$PWD/$release\"",
    "  release_target=\"$(canonicalize_path \"$release_path\")\"",
    "  if [ \"$release_target\" = \"$current_target\" ]; then",
    "    continue",
    "  fi",
    "  if [ -L \"$release_path\" ]; then",
    "    rm -f -- \"$release_path\"",
    "  else",
    "    rm -rf -- \"$release_path\"",
    "  fi",
    "done",
  ].join("\n");
}
