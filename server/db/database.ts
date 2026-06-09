import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { migrateDatabase } from "./migrate.js";

export type AppDatabase = DatabaseSync;

export function openDatabase(databasePath: string): AppDatabase {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  migrateDatabase(db);
  return db;
}

export function createTestDatabase(): AppDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export { migrateDatabase };
