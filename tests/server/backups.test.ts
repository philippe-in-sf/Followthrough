import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseBackup } from "../../server/db/backups";
import { openDatabase } from "../../server/db/database";

const tempDirs: string[] = [];
const dbs: ReturnType<typeof openDatabase>[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("database backups", () => {
  it("creates retained SQLite snapshots and writes a manifest", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "followthrough-backups-"));
    tempDirs.push(tempDir);
    const databasePath = path.join(tempDir, "app.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const db = openDatabase(databasePath);
    dbs.push(db);

    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Backup Team");

    const first = createDatabaseBackup(
      db,
      { backupDir, backupRetentionCount: 2 },
      new Date("2026-07-14T00:00:00.000Z"),
    );
    const second = createDatabaseBackup(
      db,
      { backupDir, backupRetentionCount: 2 },
      new Date("2026-07-15T00:00:00.000Z"),
    );
    const third = createDatabaseBackup(
      db,
      { backupDir, backupRetentionCount: 2 },
      new Date("2026-07-16T00:00:00.000Z"),
    );

    expect(fs.existsSync(first.backupPath)).toBe(false);
    expect(fs.existsSync(second.backupPath)).toBe(true);
    expect(fs.existsSync(third.backupPath)).toBe(true);
    expect(third.removed).toEqual([first.backupPath]);

    const manifest = fs.readFileSync(path.join(backupDir, "manifest.jsonl"), "utf8").trim().split("\n");
    expect(manifest).toHaveLength(3);
    expect(JSON.parse(manifest[2])).toEqual(
      expect.objectContaining({
        backupPath: third.backupPath,
        removed: [first.backupPath],
      }),
    );
  });
});
