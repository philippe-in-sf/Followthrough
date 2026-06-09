import type { AppDatabase } from "./database.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function withTransaction<T>(db: AppDatabase, work: () => T): T {
  if (db.isTransaction) {
    throw new Error("Nested transactions are not supported by withTransaction");
  }

  db.exec("BEGIN IMMEDIATE");
  let shouldRollback = true;

  try {
    const result = work();

    if (isThenable(result)) {
      db.exec("ROLLBACK");
      shouldRollback = false;
      throw new Error("withTransaction only accepts synchronous work");
    }

    db.exec("COMMIT");
    shouldRollback = false;
    return result;
  } catch (error) {
    if (shouldRollback && db.isTransaction) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
}

function allocatePublicId(db: AppDatabase, prefix: string): string {
  const row = db
    .prepare(
      `
        INSERT INTO id_counters (prefix, next_value)
        VALUES (?, 2)
        ON CONFLICT(prefix) DO UPDATE SET next_value = next_value + 1
        RETURNING next_value - 1 AS allocated_value
      `,
    )
    .get(prefix) as { allocated_value: number } | undefined;

  if (!row) {
    throw new Error(`Unable to allocate public ID for prefix ${prefix}`);
  }

  return `${prefix}${String(row.allocated_value).padStart(3, "0")}`;
}

export function nextPublicId(db: AppDatabase, prefix: string): string {
  if (db.isTransaction) {
    return allocatePublicId(db, prefix);
  }

  return withTransaction(db, () => allocatePublicId(db, prefix));
}
