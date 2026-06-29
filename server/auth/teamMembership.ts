import type { AppDatabase } from "../db/database.js";
import { withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { getAuthUserById, type AuthUser } from "./sessions.js";

type UserTeamRow = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  team_id: number;
};

function personalTeamName(userName: string) {
  return `${userName}'s workspace`;
}

export function countTeamAdmins(db: AppDatabase, teamId: number) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE team_id = ? AND role = 'admin'")
    .get(teamId) as { count: number };
  return row.count;
}

function getUserTeamRow(db: AppDatabase, userId: number) {
  const row = db
    .prepare("SELECT id, name, email, role, team_id FROM users WHERE id = ?")
    .get(userId) as UserTeamRow | undefined;
  if (!row) throw notFound("User not found");
  return row;
}

export function moveUserToPersonalTeam(
  db: AppDatabase,
  userId: number,
  options: { revokeSessions?: boolean } = {},
): AuthUser {
  return withTransaction(db, () => {
    const user = getUserTeamRow(db, userId);

    if (user.role === "admin" && countTeamAdmins(db, user.team_id) <= 1) {
      throw badRequest("At least one admin is required");
    }

    const teamResult = db
      .prepare("INSERT INTO teams (name) VALUES (?)")
      .run(personalTeamName(user.name));
    const nextTeamId = Number(teamResult.lastInsertRowid);

    db.prepare("UPDATE users SET team_id = ?, role = 'admin' WHERE id = ?").run(
      nextTeamId,
      user.id,
    );

    if (options.revokeSessions) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    }

    const movedUser = getAuthUserById(db, user.id);
    if (!movedUser) throw new Error("Moved user could not be loaded");
    return movedUser;
  });
}
