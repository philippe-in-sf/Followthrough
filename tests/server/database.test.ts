import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";
import { nextPublicId, withTransaction } from "../../server/db/ids";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("database migrations", () => {
  it("creates the core tables", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("tasks");

    expect(row).toEqual({ name: "tasks" });
  });
});

describe("public IDs", () => {
  it("allocates padded IDs per prefix", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    expect(nextPublicId(db, "T")).toBe("T001");
    expect(nextPublicId(db, "T")).toBe("T002");
    expect(nextPublicId(db, "M")).toBe("M001");
  });

  it("can allocate IDs inside a larger transaction", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const id = withTransaction(db, () => nextPublicId(db, "D"));

    expect(id).toBe("D001");
  });
});
