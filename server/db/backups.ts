import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import {
  assertBackupEncryptionConfigured,
  encryptDatabaseBackupFile,
} from "./backupEncryption.js";
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
  return `followthrough-${createdAt.replaceAll(":", "-")}.sqlite.enc`;
}

function listBackupFiles(backupDir: string) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((file) => /^followthrough-\d{4}-\d{2}-\d{2}T.*\.sqlite\.enc$/.test(file))
    .sort()
    .map((file) => path.join(backupDir, file));
}

function appendManifest(backupDir: string, result: DatabaseBackupResult) {
  const manifestPath = path.join(backupDir, "manifest.jsonl");
  fs.appendFileSync(manifestPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
}

export function encryptLegacyDatabaseBackups(
  config: Pick<
    AppConfig,
    "backupDir" | "backupEncryptionKey" | "backupEncryptionPreviousKeys"
  >,
) {
  if (!fs.existsSync(config.backupDir)) return [];
  fs.chmodSync(config.backupDir, 0o700);
  const legacyFiles = fs
    .readdirSync(config.backupDir)
    .filter((file) => /^followthrough-\d{4}-\d{2}-\d{2}T.*\.sqlite$/.test(file))
    .sort()
    .map((file) => path.join(config.backupDir, file));

  const encrypted: string[] = [];
  for (const legacyPath of legacyFiles) {
    const encryptedPath = `${legacyPath}.enc`;
    encryptDatabaseBackupFile(legacyPath, encryptedPath, config);
    fs.rmSync(legacyPath, { force: true });
    encrypted.push(encryptedPath);
  }
  return encrypted;
}

export function createDatabaseBackup(
  db: AppDatabase,
  config: Pick<
    AppConfig,
    | "backupDir"
    | "backupRetentionCount"
    | "backupEncryptionKey"
    | "backupEncryptionPreviousKeys"
  >,
  now = new Date(),
): DatabaseBackupResult {
  assertBackupEncryptionConfigured(config);
  fs.mkdirSync(config.backupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(config.backupDir, 0o700);

  const createdAt = now.toISOString();
  const backupPath = path.join(config.backupDir, backupFileName(createdAt));
  const plaintextPath = `${backupPath}.plaintext-${process.pid}`;
  try {
    db.exec(`VACUUM INTO ${quoteSqlString(plaintextPath)}`);
    fs.chmodSync(plaintextPath, 0o600);
    encryptDatabaseBackupFile(plaintextPath, backupPath, config);
  } finally {
    fs.rmSync(plaintextPath, { force: true });
  }

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
  if (!config.backupEncryptionKey.trim()) {
    if (config.nodeEnv === "production") {
      throw new Error("BACKUP_ENCRYPTION_KEY is required when built-in backups are enabled");
    }
    console.warn("Built-in backups are disabled until BACKUP_ENCRYPTION_KEY is configured");
    return { stop() {} };
  }

  assertBackupEncryptionConfigured(config);
  const migrated = encryptLegacyDatabaseBackups(config);
  if (migrated.length > 0) {
    console.log(`Encrypted ${migrated.length} existing database backup(s)`);
  }

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
