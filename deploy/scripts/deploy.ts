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
  buildVersionCheckCommand,
} from "../lib/remoteCommands";
import { readPackageVersion } from "../lib/packageVersion";
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

function remoteCapture(site: DeploySite, command: string) {
  const result = spawnSync("ssh", [site.ssh, "bash", "-s"], {
    input: command,
    encoding: "utf8",
    shell: false,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
  };
}

function readRemoteVersion(site: DeploySite) {
  const result = remoteCapture(site, buildVersionCheckCommand(site));
  if (!result.ok || !result.stdout) return null;

  try {
    const parsed = JSON.parse(result.stdout) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version : null;
  } catch {
    return null;
  }
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

function verifyRemoteVersion(site: DeploySite, localVersion: string) {
  const remoteVersion = readRemoteVersion(site);
  if (!remoteVersion) {
    console.log(`Remote version unavailable for ${site.name}; continuing`);
    return;
  }

  if (remoteVersion === localVersion) {
    throw new Error(
      `${site.name} already reports version ${localVersion}; run npm run version:patch before deploying`,
    );
  }

  console.log(`Remote ${site.name} reports version ${remoteVersion}; deploying ${localVersion}`);
}

function deploySite(site: DeploySite, release: { releaseId: string; releaseDir: string }, localVersion: string) {
  console.log(`Deploying ${site.name} to ${site.ssh}`);

  verifyRemoteVersion(site, localVersion);
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

  const localVersion = readPackageVersion();
  const gitSha = captureRequired("git", ["rev-parse", "--short", "HEAD"], "git commit");
  const releaseId = createReleaseId(new Date(), gitSha);
  const { stageRoot, releaseDir } = stageRelease(releaseId);

  try {
    for (const site of sites) {
      deploySite(site, { releaseId, releaseDir }, localVersion);
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
