import type { Request } from "express";
import type { AppDatabase } from "../db/database.js";

export function recordLoginEvent(db: AppDatabase, req: Request, userId: number, teamId: number) {
  const ipAddress = req.ip || null;
  const userAgent = req.get("user-agent") ?? null;

  db.prepare(
    `INSERT INTO user_login_events (user_id, team_id, ip_address, user_agent)
     VALUES (?, ?, ?, ?)`,
  ).run(userId, teamId, ipAddress, userAgent);
}
