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
