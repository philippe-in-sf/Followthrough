import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppDatabase } from "./database.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir() {
  const candidates = [
    path.join(moduleDir, "migrations"),
    path.resolve(process.cwd(), "server/db/migrations"),
  ];

  const migrationsDir = candidates.find((candidate) => fs.existsSync(candidate));
  if (!migrationsDir) {
    throw new Error(`Unable to find database migrations in: ${candidates.join(", ")}`);
  }

  return migrationsDir;
}

export function migrateDatabase(db: AppDatabase) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

  const migrationsDir = resolveMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(".sql", "");
    const applied = db
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(version);

    if (applied) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    if (sql.includes("-- migrate: no-transaction")) {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
