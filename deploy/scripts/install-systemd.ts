import { spawnSync } from "node:child_process";
import { findDeploySite, parseDeployConfig, type DeploySite } from "../lib/config";
import { buildInstallSystemdCommand } from "../lib/systemdInstall";

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
  console.log(`Installing systemd service ${site.serviceName} on ${site.ssh}`);
  remote(site, buildInstallSystemdCommand(site));
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
