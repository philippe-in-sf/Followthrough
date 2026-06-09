import type { AppDatabase } from "./database.js";

export function withTransaction<T>(db: AppDatabase, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function nextPublicId(db: AppDatabase, prefix: string): string {
  const row = db
    .prepare("SELECT next_value FROM id_counters WHERE prefix = ?")
    .get(prefix) as { next_value: number } | undefined;

  const nextValue = row?.next_value ?? 1;

  if (row) {
    db.prepare("UPDATE id_counters SET next_value = ? WHERE prefix = ?").run(
      nextValue + 1,
      prefix,
    );
  } else {
    db.prepare("INSERT INTO id_counters (prefix, next_value) VALUES (?, ?)").run(
      prefix,
      nextValue + 1,
    );
  }

  return `${prefix}${String(nextValue).padStart(3, "0")}`;
}
