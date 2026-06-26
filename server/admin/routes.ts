import { Router } from "express";
import { z } from "zod";
import type { TeamDto, TeamUserDto } from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";
import { createUser } from "../auth/userManagement.js";

type TeamRow = {
  id: number;
  name: string;
  logo_url: string | null;
  work_calendar_url: string | null;
};

type TeamUserRow = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  team_id: number;
};

const teamInputSchema = z.object({
  name: z.string().trim().min(1),
  logoUrl: z.string().nullable(),
  workCalendarUrl: z.string().nullable(),
});

const userInputSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12),
  role: z.enum(["admin", "member"]),
});

const roleInputSchema = z.object({
  role: z.enum(["admin", "member"]),
});

function parseOptionalWebUrl(value: string | null, field: "logo" | "calendar") {
  if (value === null) return null;
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid");
    }
    return candidate;
  } catch {
    throw badRequest(`Enter a valid http or https ${field} URL.`);
  }
}

function teamDto(row: TeamRow): TeamDto {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    workCalendarUrl: row.work_calendar_url,
  };
}

function userDto(row: TeamUserRow): TeamUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    teamId: row.team_id,
  };
}

function getTeam(db: AppDatabase, teamId: number) {
  const row = db
    .prepare("SELECT id, name, logo_url, work_calendar_url FROM teams WHERE id = ?")
    .get(teamId) as TeamRow | undefined;
  if (!row) throw notFound("Team not found");
  return row;
}

function getTeamUser(db: AppDatabase, teamId: number, userId: number) {
  const row = db
    .prepare("SELECT id, name, email, role, team_id FROM users WHERE id = ? AND team_id = ?")
    .get(userId, teamId) as TeamUserRow | undefined;
  if (!row) throw notFound("User not found");
  return row;
}

function countTeamAdmins(db: AppDatabase, teamId: number) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE team_id = ? AND role = 'admin'")
    .get(teamId) as { count: number };
  return row.count;
}

export function adminRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/team", (req, res, next) => {
    try {
      res.json({ team: teamDto(getTeam(db, req.user?.teamId ?? 0)) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/team", (req, res, next) => {
    try {
      const input = parseBody(req, teamInputSchema);
      const logoUrl = parseOptionalWebUrl(input.logoUrl, "logo");
      const workCalendarUrl = parseOptionalWebUrl(input.workCalendarUrl, "calendar");
      const teamId = req.user?.teamId ?? 0;

      db.prepare(
        `UPDATE teams
         SET name = ?,
             logo_url = ?,
             work_calendar_url = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(input.name, logoUrl, workCalendarUrl, teamId);

      res.json({ team: teamDto(getTeam(db, teamId)) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, name, email, role, team_id
         FROM users
         WHERE team_id = ?
         ORDER BY name COLLATE NOCASE`,
      )
      .all(req.user?.teamId ?? 0) as TeamUserRow[];

    res.json({ users: rows.map(userDto) });
  });

  router.post("/users", async (req, res, next) => {
    try {
      const input = parseBody(req, userInputSchema);
      const user = await createUser(db, {
        ...input,
        teamId: req.user?.teamId ?? 0,
      });

      res.status(201).json({
        user: userDto({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          team_id: user.teamId,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/users/:userId/role", (req, res, next) => {
    try {
      const input = parseBody(req, roleInputSchema);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId < 1) throw notFound("User not found");

      const teamId = req.user?.teamId ?? 0;
      const existing = getTeamUser(db, teamId, userId);
      if (existing.role === "admin" && input.role === "member" && countTeamAdmins(db, teamId) <= 1) {
        throw badRequest("At least one admin is required");
      }

      db.prepare("UPDATE users SET role = ? WHERE id = ? AND team_id = ?").run(
        input.role,
        userId,
        teamId,
      );

      res.json({ user: userDto(getTeamUser(db, teamId, userId)) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
