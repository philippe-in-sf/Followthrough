import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";
import { nextPublicId, withTransaction } from "../../server/db/ids";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

function applyMigrationsBefore(db: ReturnType<typeof createTestDatabase>, stopBefore: string) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const migrationsDir = path.resolve(process.cwd(), "server/db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && file < stopBefore)
    .sort();

  for (const file of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
      file.replace(".sql", ""),
    );
  }
}

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

  it("creates a default team for fresh databases", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const team = db
      .prepare("SELECT id, name, logo_url, work_calendar_url FROM teams")
      .get() as
      | { id: number; name: string; logo_url: string | null; work_calendar_url: string | null }
      | undefined;

    expect(team).toEqual({
      id: 1,
      name: "Default Team",
      logo_url: null,
      work_calendar_url: null,
    });
  });

  it("backfills existing users and shared records into the default team", () => {
    const db = createTestDatabase();
    dbs.push(db);
    applyMigrationsBefore(db, "012_team_admin_roles.sql");

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
    ).run(1, "Existing Admin", "existing@example.com", "hash");
    db.prepare("INSERT INTO people (id, public_id, name) VALUES (?, ?, ?)").run(
      1,
      "P001",
      "Avery",
    );
    db.prepare(
      "INSERT INTO meeting_series (id, public_id, title, cadence_label) VALUES (?, ?, ?, ?)",
    ).run(1, "S001", "Weekly", "Weekly");
    db.prepare(
      "INSERT INTO meetings (id, public_id, title, starts_at, meeting_type, series_id) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(1, "M001", "Planning", "2026-06-09T15:00:00.000Z", "recurring", 1);
    db.prepare(
      "INSERT INTO tasks (id, public_id, description, status, assignee_person_id, origin_meeting_id, series_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(1, "T001", "Send notes", "Open", 1, 1, 1, 1);
    db.prepare(
      "INSERT INTO decisions (id, public_id, decision_text, decision_date, meeting_id) VALUES (?, ?, ?, ?, ?)",
    ).run(1, "D001", "Use SQLite", "2026-06-09", 1);

    migrateDatabase(db);

    const user = db
      .prepare("SELECT team_id, role FROM users WHERE id = 1")
      .get() as { team_id: number; role: string };
    expect(user).toEqual({ team_id: 1, role: "admin" });

    for (const table of ["people", "meeting_series", "meetings", "tasks", "decisions"]) {
      const row = db.prepare(`SELECT team_id FROM ${table} WHERE id = 1`).get() as {
        team_id: number;
      };
      expect(row.team_id).toBe(1);
    }
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
