import fs from "node:fs";
import path from "node:path";
import type { AppDatabase } from "./database.js";

const migrationsDir = path.resolve(process.cwd(), "server/db/migrations");

export function migrateDatabase(db: AppDatabase) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

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

    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
