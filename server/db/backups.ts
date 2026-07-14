import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "./database.js";

export type DatabaseBackupResult = {
  backupPath: string;
  createdAt: string;
  retained: string[];
  removed: string[];
};

export type DatabaseBackupJob = {
  stop(): void;
};

function quoteSqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function backupFileName(createdAt: string) {
  return `followthrough-${createdAt.replaceAll(":", "-")}.sqlite`;
}

function listBackupFiles(backupDir: string) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((file) => /^followthrough-\d{4}-\d{2}-\d{2}T.*\.sqlite$/.test(file))
    .sort()
    .map((file) => path.join(backupDir, file));
}

function appendManifest(backupDir: string, result: DatabaseBackupResult) {
  const manifestPath = path.join(backupDir, "manifest.jsonl");
  fs.appendFileSync(manifestPath, `${JSON.stringify(result)}\n`);
}

export function createDatabaseBackup(
  db: AppDatabase,
  config: Pick<AppConfig, "backupDir" | "backupRetentionCount">,
  now = new Date(),
): DatabaseBackupResult {
  fs.mkdirSync(config.backupDir, { recursive: true });

  const createdAt = now.toISOString();
  const backupPath = path.join(config.backupDir, backupFileName(createdAt));
  db.exec(`VACUUM INTO ${quoteSqlString(backupPath)}`);

  const backupFiles = listBackupFiles(config.backupDir);
  const retentionCount = Math.max(1, config.backupRetentionCount);
  const retained = backupFiles.slice(-retentionCount);
  const removed = backupFiles.slice(0, Math.max(0, backupFiles.length - retentionCount));

  for (const file of removed) {
    fs.rmSync(file, { force: true });
  }

  const result = { backupPath, createdAt, retained, removed };
  appendManifest(config.backupDir, result);
  return result;
}

export function startDatabaseBackupJob(db: AppDatabase, config: AppConfig): DatabaseBackupJob {
  if (!config.backupEnabled) return { stop() {} };

  let running = false;
  function run() {
    if (running) return;
    running = true;
    try {
      const result = createDatabaseBackup(db, config);
      console.log(`Created database backup at ${result.backupPath}`);
    } catch (error) {
      console.error("Database backup failed", error);
    } finally {
      running = false;
    }
  }

  run();
  const timer = setInterval(run, config.backupIntervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
