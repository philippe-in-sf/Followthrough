import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDatabaseBackup,
  encryptLegacyDatabaseBackups,
  startDatabaseBackupJob,
} from "../../server/db/backups";
import { decryptDatabaseBackupFile } from "../../server/db/backupEncryption";
import { loadConfig } from "../../server/config";
import { openDatabase } from "../../server/db/database";

const tempDirs: string[] = [];
const dbs: ReturnType<typeof openDatabase>[] = [];
const backupEncryptionKey = Buffer.alloc(32, 7).toString("base64");

function backupConfig(
  backupDir: string,
  backupRetentionCount = 2,
  currentKey = backupEncryptionKey,
  previousKeys: string[] = [],
) {
  return {
    backupDir,
    backupRetentionCount,
    backupEncryptionKey: currentKey,
    backupEncryptionPreviousKeys: previousKeys,
  };
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("database backups", () => {
  it("creates retained encrypted snapshots and writes a protected manifest", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "followthrough-backups-"));
    tempDirs.push(tempDir);
    const databasePath = path.join(tempDir, "app.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const db = openDatabase(databasePath);
    dbs.push(db);

    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Backup Team");

    const first = createDatabaseBackup(
      db,
      backupConfig(backupDir),
      new Date("2026-07-14T00:00:00.000Z"),
    );
    const second = createDatabaseBackup(
      db,
      backupConfig(backupDir),
      new Date("2026-07-15T00:00:00.000Z"),
    );
    const third = createDatabaseBackup(
      db,
      backupConfig(backupDir),
      new Date("2026-07-16T00:00:00.000Z"),
    );

    expect(fs.existsSync(first.backupPath)).toBe(false);
    expect(fs.existsSync(second.backupPath)).toBe(true);
    expect(fs.existsSync(third.backupPath)).toBe(true);
    expect(third.backupPath).toMatch(/\.sqlite\.enc$/);
    expect(fs.readFileSync(third.backupPath).subarray(0, 11).toString()).toBe("FTBACKUP:v1");
    expect(fs.readFileSync(third.backupPath).toString("utf8")).not.toContain("Backup Team");
    expect(fs.statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(third.backupPath).mode & 0o777).toBe(0o600);
    expect(third.removed).toEqual([first.backupPath]);

    const manifest = fs.readFileSync(path.join(backupDir, "manifest.jsonl"), "utf8").trim().split("\n");
    expect(manifest).toHaveLength(3);
    expect(fs.statSync(path.join(backupDir, "manifest.jsonl")).mode & 0o777).toBe(0o600);
    expect(JSON.parse(manifest[2])).toEqual(
      expect.objectContaining({
        backupPath: third.backupPath,
        removed: [first.backupPath],
      }),
    );

    const restoredPath = path.join(tempDir, "restored.sqlite");
    decryptDatabaseBackupFile(third.backupPath, restoredPath, backupConfig(backupDir));
    const restored = openDatabase(restoredPath);
    dbs.push(restored);
    const team = restored
      .prepare("SELECT name FROM teams WHERE name = ?")
      .get("Backup Team");
    expect(team).toEqual({ name: "Backup Team" });
    expect(fs.statSync(restoredPath).mode & 0o777).toBe(0o600);
  });

  it("rejects tampered backups without publishing plaintext", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "followthrough-backups-"));
    tempDirs.push(tempDir);
    const backupDir = path.join(tempDir, "backups");
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    dbs.push(db);
    const backup = createDatabaseBackup(
      db,
      backupConfig(backupDir),
      new Date("2026-07-16T00:00:00.000Z"),
    );
    const bytes = fs.readFileSync(backup.backupPath);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    fs.writeFileSync(backup.backupPath, bytes);

    const restoredPath = path.join(tempDir, "tampered.sqlite");
    expect(() =>
      decryptDatabaseBackupFile(backup.backupPath, restoredPath, backupConfig(backupDir)),
    ).toThrow("authentication failed");
    expect(fs.existsSync(restoredPath)).toBe(false);
  });

  it("decrypts retained backups with a previous rotation key", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "followthrough-backups-"));
    tempDirs.push(tempDir);
    const backupDir = path.join(tempDir, "backups");
    const oldKey = Buffer.alloc(32, 3).toString("base64");
    const newKey = Buffer.alloc(32, 4).toString("base64");
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    dbs.push(db);
    const backup = createDatabaseBackup(
      db,
      backupConfig(backupDir, 2, oldKey),
      new Date("2026-07-16T00:00:00.000Z"),
    );

    const restoredPath = path.join(tempDir, "rotated.sqlite");
    decryptDatabaseBackupFile(
      backup.backupPath,
      restoredPath,
      backupConfig(backupDir, 2, newKey, [oldKey]),
    );
    expect(fs.existsSync(restoredPath)).toBe(true);
  });

  it("encrypts existing plaintext snapshots before the backup job continues", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "followthrough-backups-"));
    tempDirs.push(tempDir);
    const backupDir = path.join(tempDir, "backups");
    fs.mkdirSync(backupDir);
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    dbs.push(db);
    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Legacy Backup Team");
    const legacyPath = path.join(
      backupDir,
      "followthrough-2026-07-15T00-00-00.000Z.sqlite",
    );
    db.exec(`VACUUM INTO '${legacyPath}'`);

    const migrated = encryptLegacyDatabaseBackups(backupConfig(backupDir));

    expect(migrated).toEqual([`${legacyPath}.enc`]);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(`${legacyPath}.enc`)).toBe(true);
    expect(fs.statSync(backupDir).mode & 0o777).toBe(0o700);
  });

  it("refuses to start unencrypted built-in backups in production", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "followthrough-backups-"));
    tempDirs.push(tempDir);
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    dbs.push(db);

    expect(() =>
      startDatabaseBackupJob(db, {
        ...loadConfig(),
        nodeEnv: "production",
        backupEnabled: true,
        backupDir: path.join(tempDir, "backups"),
        backupEncryptionKey: "",
      }),
    ).toThrow("BACKUP_ENCRYPTION_KEY is required");
  });
});
