import type { AuditEntityType, AuditLogDto } from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";

type AuditRow = {
  id: number;
  entity_type: AuditEntityType;
  entity_public_id: string;
  action: string;
  summary: string;
  changes_json: string;
  created_at: string;
  actor_name: string | null;
};

type AuditInput = {
  entityType: AuditEntityType;
  entityPublicId: string;
  action: string;
  userId: number | null;
  summary: string;
  changes?: Record<string, unknown>;
};

function parseChanges(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function toAuditDto(row: AuditRow): AuditLogDto {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityPublicId: row.entity_public_id,
    action: row.action,
    summary: row.summary,
    actorName: row.actor_name,
    createdAt: row.created_at,
    changes: parseChanges(row.changes_json),
  };
}

export function recordAuditEvent(db: AppDatabase, input: AuditInput) {
  db.prepare(
    `INSERT INTO audit_events
     (entity_type, entity_public_id, action, user_id, summary, changes_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.entityType,
    input.entityPublicId,
    input.action,
    input.userId,
    input.summary,
    JSON.stringify(input.changes ?? {}),
  );
}

export function getAuditEvents(
  db: AppDatabase,
  entityType: AuditEntityType,
  entityPublicId: string,
) {
  const rows = db
    .prepare(
      `SELECT audit_events.id,
              audit_events.entity_type,
              audit_events.entity_public_id,
              audit_events.action,
              audit_events.summary,
              audit_events.changes_json,
              audit_events.created_at,
              users.name AS actor_name
       FROM audit_events
       LEFT JOIN users ON users.id = audit_events.user_id
       WHERE audit_events.entity_type = ? AND audit_events.entity_public_id = ?
       ORDER BY audit_events.id DESC`,
    )
    .all(entityType, entityPublicId) as AuditRow[];

  return rows.map(toAuditDto);
}
