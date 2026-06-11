import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const deployScript = path.join(repoRoot, "deploy/scripts/deploy.ts");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

function writeExecutable(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

describe("deploy runner", () => {
  it("removes the local staging root when copying runtime files fails", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-runner-work-"));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-runner-tmp-"));
    const binDir = path.join(workDir, "bin");
    fs.mkdirSync(binDir);

    try {
      writeExecutable(path.join(binDir, "npm"), "#!/bin/sh\nexit 0\n");
      writeExecutable(path.join(binDir, "git"), "#!/bin/sh\nprintf 'abcdef1'\n");
      fs.writeFileSync(path.join(workDir, "package.json"), "{}\n");
      fs.writeFileSync(path.join(workDir, "package-lock.json"), "{}\n");

      const result = spawnSync(process.execPath, [tsxCli, deployScript, "production"], {
        cwd: workDir,
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_SITES: "production",
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
          TMPDIR: tempDir,
        },
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("ENOENT");
      expect(
        fs.readdirSync(tempDir).filter((entry) => entry.startsWith("web-ui-task-manager-release-")),
      ).toEqual([]);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
