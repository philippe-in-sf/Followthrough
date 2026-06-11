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

function run(command: string, args: string[], options: { cwd?: string; input?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
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
  run("ssh", [site.ssh, "bash", "-s"], { input: command });
}

function stageRelease(releaseId: string) {
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-ui-task-manager-release-"));
  try {
    const releaseDir = path.join(stageRoot, releaseId);
    fs.mkdirSync(releaseDir, { recursive: true });

    for (const runtimePath of runtimePaths) {
      fs.cpSync(runtimePath, path.join(releaseDir, runtimePath), {
        recursive: true,
        dereference: false,
      });
    }

    return { stageRoot, releaseDir };
  } catch (error) {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    throw error;
  }
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
