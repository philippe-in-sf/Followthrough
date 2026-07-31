import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, migrateDatabase } from "../../server/db/database";
import { archiveStaleClosedTasks } from "../../server/tasks/archiveJob";

const dbs: ReturnType<typeof createTestDatabase>[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

describe("automatic closed-task archival", () => {
  it("archives Done and Won't Fix tasks after 14 days and records an audit entry", () => {
    const db = createTestDatabase();
    dbs.push(db);
    migrateDatabase(db);

    const insertTask = db.prepare(
      `INSERT INTO tasks
       (public_id, description, status, status_changed_at, archived_at, team_id)
       VALUES (?, ?, ?, ?, ?, 1)`,
    );
    insertTask.run("T001", "Old completed work", "Done", "2026-06-15T12:00:00Z", null);
    insertTask.run(
      "T002",
      "Old rejected work",
      "Won't Fix",
      "2026-06-16T12:00:00Z",
      null,
    );
    insertTask.run("T003", "Recently completed", "Done", "2026-06-16T12:00:01Z", null);
    insertTask.run("T004", "Still active", "Open", "2026-05-01T12:00:00Z", null);
    insertTask.run(
      "T005",
      "Already archived",
      "Done",
      "2026-05-01T12:00:00Z",
      "2026-05-20T12:00:00Z",
    );

    const now = new Date("2026-06-30T12:00:00Z");
    const result = archiveStaleClosedTasks(db, { taskAutoArchiveAfterDays: 14 }, now);

    expect(result.archivedTaskPublicIds).toEqual(["T001", "T002"]);
    const rows = db
      .prepare("SELECT public_id, archived_at FROM tasks ORDER BY public_id")
      .all() as Array<{ public_id: string; archived_at: string | null }>;
    expect(rows).toEqual([
      { public_id: "T001", archived_at: now.toISOString() },
      { public_id: "T002", archived_at: now.toISOString() },
      { public_id: "T003", archived_at: null },
      { public_id: "T004", archived_at: null },
      { public_id: "T005", archived_at: "2026-05-20T12:00:00Z" },
    ]);

    const audits = db
      .prepare(
        `SELECT entity_public_id, action, user_id, summary, changes_json
         FROM audit_events
         ORDER BY entity_public_id`,
      )
      .all() as Array<{
      entity_public_id: string;
      action: string;
      user_id: number | null;
      summary: string;
      changes_json: string;
    }>;
    expect(audits).toHaveLength(2);
    expect(audits[0]).toEqual(
      expect.objectContaining({
        entity_public_id: "T001",
        action: "auto_archived",
        user_id: null,
        summary: "Archived automatically after 14 days in Done",
      }),
    );
    expect(JSON.parse(audits[0].changes_json)).toEqual({
      archivedAt: now.toISOString(),
      status: "Done",
      statusChangedAt: "2026-06-15T12:00:00Z",
      retentionDays: 14,
    });

    expect(
      archiveStaleClosedTasks(db, { taskAutoArchiveAfterDays: 14 }, now)
        .archivedTaskPublicIds,
    ).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual({ count: 2 });
  });
});
