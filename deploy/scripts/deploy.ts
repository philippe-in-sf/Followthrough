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
  buildRsyncReleaseTarget,
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

function captureRequired(command: string, args: string[], description: string) {
  const output = capture(command, args);
  if (!output) {
    throw new Error(`Unable to determine ${description}: ${command} ${args.join(" ")}`);
  }

  return output;
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

function runLocalGates() {
  run("npm", ["run", "check"]);
  run("npm", ["run", "test"]);
  run("npm", ["run", "build"]);
}

function deploySite(site: DeploySite, release: { releaseId: string; releaseDir: string }) {
  console.log(`Deploying ${site.name} to ${site.ssh}`);

  remote(site, buildEnsureLayoutCommand(site));
  run("rsync", ["-az", "--delete", `${release.releaseDir}/`, buildRsyncReleaseTarget(site, release.releaseId)]);
  remote(site, buildInstallDependenciesCommand(site, release.releaseId));
  remote(site, buildSwitchCurrentCommand(site, release.releaseId));
  remote(site, buildRestartCommand(site));
  remote(site, buildHealthCheckCommand(site));
  remote(site, buildCleanupCommand(site));

  console.log(`Deployed ${site.name} release ${release.releaseId}`);
}

function main() {
  const [, , target = "all"] = process.argv;
  const config = parseDeployConfig();
  const sites = target === "all" ? config.sites : [findDeploySite(config, target)];
  runLocalGates();

  const gitSha = captureRequired("git", ["rev-parse", "--short", "HEAD"], "git commit");
  const releaseId = createReleaseId(new Date(), gitSha);
  const { stageRoot, releaseDir } = stageRelease(releaseId);

  try {
    for (const site of sites) {
      deploySite(site, { releaseId, releaseDir });
    }
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
