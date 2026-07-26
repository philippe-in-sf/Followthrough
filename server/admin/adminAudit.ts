import type { AdminAuditAction, AdminAuditEventDto } from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";

/**
 * Records privileged administrative actions (impersonation, role changes,
 * admin-initiated password resets) to the admin_audit_events table.
 *
 * Actor and target emails are snapshotted at write time so the record stays
 * meaningful after a user is deleted (the table's foreign keys are
 * ON DELETE SET NULL, so the ids may later become null but the emails remain).
 *
 * Events are filed under the affected user's team (`teamId`) so that team's
 * admins can review actions taken against their members; the owner sees all.
 */

type AdminAuditInput = {
  action: AdminAuditAction;
  actorUserId: number;
  actorEmail: string;
  targetUserId: number | null;
  targetEmail: string | null;
  teamId: number | null;
  metadata?: Record<string, unknown>;
};

type AdminAuditRow = {
  id: number;
  action: AdminAuditAction;
  actor_user_id: number | null;
  actor_email: string;
  target_user_id: number | null;
  target_email: string | null;
  team_id: number | null;
  metadata_json: string;
  created_at: string;
};

function parseMetadata(value: string): Record<string, unknown> {
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

function toAdminAuditDto(row: AdminAuditRow): AdminAuditEventDto {
  return {
    id: row.id,
    action: row.action,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email,
    teamId: row.team_id,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
  };
}

export function recordAdminAuditEvent(db: AppDatabase, input: AdminAuditInput) {
  db.prepare(
    `INSERT INTO admin_audit_events
     (team_id, actor_user_id, actor_email, action, target_user_id, target_email, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.teamId,
    input.actorUserId,
    input.actorEmail,
    input.action,
    input.targetUserId,
    input.targetEmail,
    JSON.stringify(input.metadata ?? {}),
  );
}

export function listAdminAuditEvents(
  db: AppDatabase,
  options: { isOwner: boolean; teamId: number },
): AdminAuditEventDto[] {
  const rows = db
    .prepare(
      `SELECT id, action, actor_user_id, actor_email,
              target_user_id, target_email, team_id, metadata_json, created_at
       FROM admin_audit_events
       WHERE (? = 1 OR team_id = ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    )
    .all(options.isOwner ? 1 : 0, options.teamId) as AdminAuditRow[];

  return rows.map(toAdminAuditDto);
}
