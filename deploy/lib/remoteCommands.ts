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
    `sudo chown ${deployIdentity} ${appRoot}`,
    `sudo chown -R ${deployIdentity} ${releasesDir}`,
    `sudo chown ${deployIdentity} ${sharedDir}`,
    `sudo chown -R ${serviceIdentity} ${dataDir}`,
    `sudo chmod 700 ${dataDir}`,
    `if [ ! -f ${envFile} ]; then`,
    "  umask 077",
    `  cat > ${envFile} <<'ENV'`,
    `PORT=${site.port}`,
    `DATABASE_PATH=${defaultDatabasePath}`,
    "SESSION_COOKIE_NAME=tm_session",
    "SESSION_TTL_DAYS=14",
    "SESSION_IDLE_TIMEOUT_MINUTES=1440",
    "DUE_SOON_DAYS=7",
    "ENV",
    "fi",
    `database_path="$(sudo awk -F= '/^DATABASE_PATH=/{print substr($0,index($0,"=")+1)}' ${envFile} | tail -n 1)"`,
    `if [ -n "$database_path" ]; then`,
    `  configured_data_dir="$(dirname -- "$database_path")"`,
    `  sudo mkdir -p "$configured_data_dir"`,
    `  sudo chown ${serviceIdentity} "$configured_data_dir"`,
    `  sudo chmod 700 "$configured_data_dir"`,
    `  if sudo test -e "$database_path"; then`,
    `    sudo chown ${serviceIdentity} "$database_path"`,
    `    sudo chmod 600 "$database_path"`,
    "  fi",
    "fi",
    `backup_dir="$(sudo awk -F= '/^BACKUP_DIR=/{print substr($0,index($0,"=")+1)}' ${envFile} | tail -n 1)"`,
    `if [ -z "$backup_dir" ] && [ -n "$database_path" ]; then`,
    `  backup_dir="$(dirname -- "$database_path")/backups"`,
    "fi",
    `if ! sudo grep -Eq '^BACKUP_ENCRYPTION_KEY=.+$' ${envFile}; then`,
    `  if [ -n "$backup_dir" ] && sudo test -d "$backup_dir" && sudo find "$backup_dir" -maxdepth 1 -type f -name '*.sqlite.enc' -print -quit | grep -q .; then`,
    `    echo "BACKUP_ENCRYPTION_KEY is missing but encrypted backups already exist; restore the original key before deploying." >&2`,
    "    exit 1",
    "  fi",
    `  backup_encryption_key="$(openssl rand -base64 32)"`,
    `  printf '\\nBACKUP_ENCRYPTION_KEY=%s\\n' "$backup_encryption_key" | sudo tee -a ${envFile} >/dev/null`,
    "fi",
    `if [ -n "$backup_dir" ] && sudo test -d "$backup_dir"; then`,
    `  sudo chown -R ${serviceIdentity} "$backup_dir"`,
    `  sudo chmod 700 "$backup_dir"`,
    `  sudo find "$backup_dir" -maxdepth 1 -type f -exec chmod 600 {} +`,
    "fi",
    `sudo chown root:root ${envFile}`,
    `sudo chmod 600 ${envFile}`,
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

export function buildVersionCheckCommand(site: DeploySite) {
  validateDeployAppRoot(site.appRoot);
  const url = quoteShell(`http://127.0.0.1:${site.port}/api/version`);

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
