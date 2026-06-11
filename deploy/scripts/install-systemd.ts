import { spawnSync } from "node:child_process";
import { findDeploySite, parseDeployConfig, type DeploySite } from "../lib/config";
import { buildEnsureLayoutCommand } from "../lib/remoteCommands";
import { quoteShell } from "../lib/shell";
import { renderSystemdUnit } from "../lib/systemd";

function run(command: string, args: string[], options: { input?: string } = {}) {
  const result = spawnSync(command, args, {
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function remote(site: DeploySite, command: string) {
  run("ssh", [site.ssh, "bash", "-s"], { input: command });
}

function installSystemd(site: DeploySite) {
  const tempPath = `/tmp/${site.serviceName}.service`;
  const unitPath = `/etc/systemd/system/${site.serviceName}.service`;
  const unit = renderSystemdUnit(site);
  const installCommand = [
    "set -euo pipefail",
    buildEnsureLayoutCommand(site),
    `cat > ${quoteShell(tempPath)} <<'UNIT'`,
    unit.trimEnd(),
    "UNIT",
    `sudo mv ${quoteShell(tempPath)} ${quoteShell(unitPath)}`,
    `sudo chown root:root ${quoteShell(unitPath)}`,
    `sudo chmod 0644 ${quoteShell(unitPath)}`,
    "sudo systemctl daemon-reload",
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
