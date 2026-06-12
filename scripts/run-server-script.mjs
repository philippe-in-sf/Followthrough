import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [, , sourcePathArg, builtPathArg, ...scriptArgs] = process.argv;

if (!sourcePathArg || !builtPathArg) {
  console.error(
    "Usage: node scripts/run-server-script.mjs <source.ts> <built.js> [script args...]",
  );
  process.exit(1);
}

const appRoot = process.cwd();
const sourcePath = path.resolve(appRoot, sourcePathArg);
const builtPath = path.resolve(appRoot, builtPathArg);
const tsxPath = path.resolve(
  appRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

function commandForScript() {
  const canRunSource = fs.existsSync(sourcePath) && fs.existsSync(tsxPath);
  const canRunBuilt = fs.existsSync(builtPath);

  if (process.env.NODE_ENV === "production" && canRunBuilt) {
    return { command: process.execPath, args: [builtPath, ...scriptArgs] };
  }

  if (canRunSource) {
    return { command: tsxPath, args: [sourcePath, ...scriptArgs] };
  }

  if (canRunBuilt) {
    return { command: process.execPath, args: [builtPath, ...scriptArgs] };
  }

  console.error(`Cannot run ${sourcePathArg}. Build the app or install development dependencies.`);
  process.exit(1);
}

const { command, args } = commandForScript();
const result = spawnSync(command, args, {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to run ${sourcePathArg}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
