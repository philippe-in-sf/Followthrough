import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const deployScript = path.join(repoRoot, "deploy/scripts/deploy.ts");
const tsxImport = import.meta.resolve("tsx");

function quoteShell(value: string) {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function writeExecutable(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function createRuntimePaths(workDir: string) {
  fs.mkdirSync(path.join(workDir, "dist"));
  fs.mkdirSync(path.join(workDir, "scripts"));
  fs.writeFileSync(path.join(workDir, "dist/server.js"), "console.log('built');\n");
  fs.writeFileSync(path.join(workDir, "scripts/run-server-script.mjs"), "console.log('run');\n");
  fs.writeFileSync(path.join(workDir, "package.json"), '{"version":"1.0.1"}\n');
  fs.writeFileSync(path.join(workDir, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(workDir, "CHANGELOG.md"), "# Changelog\n\n## 1.0.1\n\n- Test release.\n");
}

function createDeployFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-runner-work-"));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-runner-tmp-"));
  const binDir = path.join(workDir, "bin");
  const commandLog = path.join(workDir, "commands.log");
  fs.mkdirSync(binDir);

  const runDeploy = (env: NodeJS.ProcessEnv, target = "all") =>
    spawnSync(process.execPath, ["--import", tsxImport, deployScript, target], {
      cwd: workDir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        TMPDIR: tempDir,
        ...env,
      },
    });

  return {
    workDir,
    tempDir,
    binDir,
    commandLog,
    runDeploy,
    cleanup: () => {
      fs.rmSync(workDir, { recursive: true, force: true });
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function readCommandLog(commandLog: string) {
  if (!fs.existsSync(commandLog)) return [];
  return fs.readFileSync(commandLog, "utf8").trim().split("\n").filter(Boolean);
}

function expectNoLocalGateOrRsync(commandLog: string) {
  const lines = readCommandLog(commandLog);
  expect(lines.some((line) => line.startsWith("npm "))).toBe(false);
  expect(lines.some((line) => line.startsWith("rsync"))).toBe(false);
}

function writeGitFixture(
  binDir: string,
  commandLog: string,
  options: {
    branch?: string;
    status?: string;
    head?: string;
    originHead?: string;
    failShortHead?: boolean;
  } = {},
) {
  const head = options.head ?? "abcdef1234567890abcdef1234567890abcdef12";
  const originHead = options.originHead ?? head;
  const shortHead = head.slice(0, 7);

  writeExecutable(
    path.join(binDir, "git"),
    `#!/bin/sh
printf 'git %s\\n' "$*" >> ${quoteShell(commandLog)}
case "$*" in
  "status --porcelain")
    printf ${quoteShell(options.status ?? "")}
    exit 0
    ;;
  "branch --show-current")
    printf ${quoteShell(`${options.branch ?? "main"}\n`)}
    exit 0
    ;;
  "fetch origin refs/heads/main:refs/remotes/origin/main")
    exit 0
    ;;
  "rev-parse HEAD")
    printf ${quoteShell(`${head}\n`)}
    exit 0
    ;;
  "rev-parse origin/main")
    printf ${quoteShell(`${originHead}\n`)}
    exit 0
    ;;
  "rev-parse --short HEAD")
    ${options.failShortHead ? "exit 1" : `printf ${quoteShell(`${shortHead}\n`)}\n    exit 0`}
    ;;
esac
exit 1
`,
  );
}

describe("deploy runner", () => {
  it("removes the local staging root when copying runtime files fails", () => {
    const fixture = createDeployFixture();

    try {
      writeExecutable(path.join(fixture.binDir, "npm"), "#!/bin/sh\nexit 0\n");
      writeGitFixture(fixture.binDir, fixture.commandLog);
      fs.writeFileSync(path.join(fixture.workDir, "package.json"), '{"version":"1.0.1"}\n');
      fs.writeFileSync(path.join(fixture.workDir, "package-lock.json"), "{}\n");

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("ENOENT");
      expect(
        fs.readdirSync(fixture.tempDir).filter((entry) => entry.startsWith("web-ui-task-manager-release-")),
      ).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  it("builds release artifacts and stages them once for multiple sites without rerunning PR verification gates", () => {
    const fixture = createDeployFixture();

    try {
      createRuntimePaths(fixture.workDir);
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog);
      writeExecutable(
        path.join(fixture.binDir, "ssh"),
        `#!/bin/sh\nprintf 'ssh %s\\n' "$1" >> ${quoteShell(fixture.commandLog)}\ncat >/dev/null\nexit 0\n`,
      );
      writeExecutable(
        path.join(fixture.binDir, "rsync"),
        `#!/bin/sh\nprintf 'rsync-source %s\\n' "$3" >> ${quoteShell(
          fixture.commandLog,
        )}\nprintf 'rsync-target %s\\n' "$4" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production,office",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
        DEPLOY_OFFICE_SSH: "office@example.com",
        DEPLOY_OFFICE_APP_ROOT: "/srv/web-ui-task-manager-office",
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status, output).toBe(0);

      const lines = readCommandLog(fixture.commandLog);
      expect(lines.filter((line) => line === "npm run changelog:check")).toHaveLength(0);
      expect(lines.filter((line) => line === "npm run check")).toHaveLength(0);
      expect(lines.filter((line) => line === "npm run test")).toHaveLength(0);
      expect(lines.filter((line) => line === "npm run build")).toHaveLength(1);
      expect(lines.filter((line) => line === "git status --porcelain")).toHaveLength(1);
      expect(lines.filter((line) => line === "git branch --show-current")).toHaveLength(1);
      expect(lines.filter((line) => line === "git fetch origin refs/heads/main:refs/remotes/origin/main")).toHaveLength(1);
      expect(lines.filter((line) => line === "git rev-parse HEAD")).toHaveLength(1);
      expect(lines.filter((line) => line === "git rev-parse origin/main")).toHaveLength(1);
      expect(lines.filter((line) => line === "git rev-parse --short HEAD")).toHaveLength(1);

      const rsyncSources = lines
        .filter((line) => line.startsWith("rsync-source "))
        .map((line) => line.replace("rsync-source ", ""));
      expect(rsyncSources).toHaveLength(2);
      expect(new Set(rsyncSources).size).toBe(1);

      const rsyncTargets = lines.filter((line) => line.startsWith("rsync-target "));
      expect(rsyncTargets).toHaveLength(2);
      expect(rsyncTargets[0]).toContain("deploy@example.com:/opt/web-ui-task-manager/releases/");
      expect(rsyncTargets[1]).toContain("office@example.com:/srv/web-ui-task-manager-office/releases/");
    } finally {
      fixture.cleanup();
    }
  });

  it("fails before deployment when the worktree is dirty", () => {
    const fixture = createDeployFixture();

    try {
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog, { status: " M README.md\n" });

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("Deploy requires a clean git worktree");
      expectNoLocalGateOrRsync(fixture.commandLog);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails before deployment when the current branch is not main", () => {
    const fixture = createDeployFixture();

    try {
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog, { branch: "codex/deploy-work" });

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("Deploy must run from main checked out at origin/main");
      expectNoLocalGateOrRsync(fixture.commandLog);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails before deployment when local main does not match origin main", () => {
    const fixture = createDeployFixture();

    try {
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog, {
        head: "abcdef1234567890abcdef1234567890abcdef12",
        originHead: "1234567890abcdef1234567890abcdef12345678",
      });

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("Deploy requires local main to match origin/main at HEAD");
      expectNoLocalGateOrRsync(fixture.commandLog);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails before rsync when the target already reports the local version", () => {
    const fixture = createDeployFixture();

    try {
      createRuntimePaths(fixture.workDir);
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog);
      writeExecutable(
        path.join(fixture.binDir, "ssh"),
        `#!/bin/sh
script="$(cat)"
case "$script" in
  *"/api/version"*)
    printf 'ssh-version %s\\n' "$1" >> ${quoteShell(fixture.commandLog)}
    printf '{"version":"1.0.1"}\\n'
    exit 0
    ;;
esac
printf 'ssh %s\\n' "$1" >> ${quoteShell(fixture.commandLog)}
exit 0
`,
      );
      writeExecutable(
        path.join(fixture.binDir, "rsync"),
        `#!/bin/sh\nprintf 'rsync %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("production already reports version 1.0.1");
      expect(readCommandLog(fixture.commandLog).some((line) => line.startsWith("rsync "))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("continues when the remote version endpoint is unavailable", () => {
    const fixture = createDeployFixture();

    try {
      createRuntimePaths(fixture.workDir);
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog);
      writeExecutable(
        path.join(fixture.binDir, "ssh"),
        `#!/bin/sh
script="$(cat)"
case "$script" in
  *"/api/version"*)
    printf 'ssh-version %s\\n' "$1" >> ${quoteShell(fixture.commandLog)}
    exit 1
    ;;
esac
printf 'ssh %s\\n' "$1" >> ${quoteShell(fixture.commandLog)}
exit 0
`,
      );
      writeExecutable(
        path.join(fixture.binDir, "rsync"),
        `#!/bin/sh\nprintf 'rsync %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status, output).toBe(0);
      expect(output).toContain("Remote version unavailable for production; continuing");
      expect(readCommandLog(fixture.commandLog).some((line) => line.startsWith("rsync "))).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails before deployment when the git SHA cannot be captured", () => {
    const fixture = createDeployFixture();

    try {
      createRuntimePaths(fixture.workDir);
      writeExecutable(
        path.join(fixture.binDir, "npm"),
        `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );
      writeGitFixture(fixture.binDir, fixture.commandLog, { failShortHead: true });
      writeExecutable(
        path.join(fixture.binDir, "ssh"),
        `#!/bin/sh\nprintf 'ssh %s\\n' "$1" >> ${quoteShell(fixture.commandLog)}\ncat >/dev/null\nexit 0\n`,
      );
      writeExecutable(
        path.join(fixture.binDir, "rsync"),
        `#!/bin/sh\nprintf 'rsync %s\\n' "$*" >> ${quoteShell(fixture.commandLog)}\nexit 0\n`,
      );

      const result = fixture.runDeploy({
        DEPLOY_SITES: "production",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("Unable to determine git commit");
      expect(readCommandLog(fixture.commandLog).some((line) => line.startsWith("rsync "))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});
