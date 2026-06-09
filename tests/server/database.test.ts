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

  it("can run repeatedly without applying duplicate migrations", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const firstRun = db
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };

    migrateDatabase(db);

    const secondRun = db
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };

    expect(firstRun.count).toBeGreaterThan(0);
    expect(secondRun.count).toBe(firstRun.count);
  });

  it("creates indexes used by carry-over lookups", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (?, ?, ?, ?, ?) ORDER BY name",
      )
      .all(
        "idx_decisions_meeting",
        "idx_meeting_attendees_person",
        "idx_meeting_tasks_task",
        "idx_tasks_origin_meeting",
        "idx_tasks_series",
      ) as { name: string }[];

    expect(rows.map((row) => row.name)).toEqual([
      "idx_decisions_meeting",
      "idx_meeting_attendees_person",
      "idx_meeting_tasks_task",
      "idx_tasks_origin_meeting",
      "idx_tasks_series",
    ]);
  });

  it("enforces foreign keys", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    expect(() => {
      db.prepare(
        "INSERT INTO tasks (public_id, description, status, assignee_person_id) VALUES (?, ?, ?, ?)",
      ).run("T999", "Invalid assignee", "Open", 999);
    }).toThrow(/FOREIGN KEY/);
  });
});

describe("public IDs", () => {
  it("allocates padded IDs per prefix from direct calls", () => {
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

describe("transactions", () => {
  it("rolls back synchronous failures", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    expect(() => {
      withTransaction(db, () => {
        db.prepare("INSERT INTO id_counters (prefix, next_value) VALUES (?, ?)").run(
          "R",
          2,
        );
        throw new Error("stop");
      });
    }).toThrow("stop");

    const row = db
      .prepare("SELECT prefix FROM id_counters WHERE prefix = ?")
      .get("R");

    expect(row).toBeUndefined();
  });

  it("rejects nested transactions clearly", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    expect(() => {
      withTransaction(db, () => {
        db.prepare("INSERT INTO id_counters (prefix, next_value) VALUES (?, ?)").run(
          "N",
          2,
        );
        return withTransaction(db, () => "nested");
      });
    }).toThrow(/Nested transactions are not supported/);

    const row = db
      .prepare("SELECT prefix FROM id_counters WHERE prefix = ?")
      .get("N");

    expect(row).toBeUndefined();
  });

  it("rejects async work and rolls back", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    expect(() => {
      withTransaction(db, () => {
        db.prepare("INSERT INTO id_counters (prefix, next_value) VALUES (?, ?)").run(
          "A",
          2,
        );
        return Promise.resolve("async");
      });
    }).toThrow(/withTransaction only accepts synchronous work/);

    const row = db
      .prepare("SELECT prefix FROM id_counters WHERE prefix = ?")
      .get("A");

    expect(row).toBeUndefined();
  });
});
