import { Router } from "express";
import { z } from "zod";
import type {
  AdminInviteCodeDto,
  TeamDto,
  TeamUserDto,
  UserLoginEventDto,
  WaitlistSignupDto,
} from "../../shared/types.js";
import type { AppDatabase } from "../db/database.js";
import type { AppConfig } from "../config.js";
import { withTransaction } from "../db/ids.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";
import { hashPassword } from "../auth/password.js";
import { resetUserPassword } from "../auth/passwordReset.js";
import { createUser, insertUserWithPasswordHash } from "../auth/userManagement.js";
import { countTeamAdmins, moveUserToPersonalTeam } from "../auth/teamMembership.js";
import { authUserDto, startSessionImpersonation } from "../auth/sessions.js";
import type { EmailSender } from "../email/mailer.js";
import { sendWelcomeEmail } from "../email/welcome.js";

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
  role: "owner" | "admin" | "member";
  team_id: number;
};

type WaitlistSignupRow = {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  handled_at: string | null;
  handled_by_user_id: number | null;
  handled_by_name: string | null;
  handled_action: "invite_code" | "direct_user" | null;
  invite_code: string | null;
  handled_user_id: number | null;
};

type InviteCodeRow = {
  id: number;
  code: string;
  usage_limit: number | null;
  default_role: "admin" | "member";
};

type UserLoginEventRow = {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
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

const passwordResetInputSchema = z.object({
  password: z.string().min(12),
});

const waitlistInviteCodeInputSchema = z.object({
  code: z.string().trim().min(1).max(80),
  role: z.enum(["admin", "member"]).default("member"),
});

const waitlistDirectUserInputSchema = z.object({
  password: z.string().min(12),
  role: z.enum(["admin", "member"]).default("member"),
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

function waitlistSignupDto(row: WaitlistSignupRow): WaitlistSignupDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    handledAt: row.handled_at,
    handledByUserId: row.handled_by_user_id,
    handledByName: row.handled_by_name,
    handledAction: row.handled_action,
    inviteCode: row.invite_code,
    createdUserId: row.handled_user_id,
  };
}

function inviteCodeDto(row: InviteCodeRow): AdminInviteCodeDto {
  return {
    id: row.id,
    code: row.code,
    usageLimit: row.usage_limit,
    defaultRole: row.default_role,
  };
}

function loginEventDto(row: UserLoginEventRow): UserLoginEventDto {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    createdAt: row.created_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
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

function isOwnerRole(role: string | undefined) {
  return role === "owner";
}

function getVisibleUser(db: AppDatabase, req: { user?: { role: string; teamId: number } }, userId: number) {
  if (isOwnerRole(req.user?.role)) {
    const row = db
      .prepare("SELECT id, name, email, role, team_id FROM users WHERE id = ?")
      .get(userId) as TeamUserRow | undefined;
    if (!row) throw notFound("User not found");
    return row;
  }

  return getTeamUser(db, req.user?.teamId ?? 0, userId);
}

function parseSignupId(value: string | undefined) {
  const signupId = Number(value);
  if (!Number.isInteger(signupId) || signupId < 1) throw notFound("Waitlist signup not found");
  return signupId;
}

function getWaitlistSignup(db: AppDatabase, signupId: number) {
  const row = db
    .prepare(
      `SELECT waitlist_signups.id,
              waitlist_signups.name,
              waitlist_signups.email,
              waitlist_signups.created_at,
              waitlist_signups.updated_at,
              waitlist_signups.handled_at,
              waitlist_signups.handled_by_user_id,
              handled_by.name AS handled_by_name,
              waitlist_signups.handled_action,
              invite_codes.code AS invite_code,
              waitlist_signups.handled_user_id
       FROM waitlist_signups
       LEFT JOIN users AS handled_by ON handled_by.id = waitlist_signups.handled_by_user_id
       LEFT JOIN invite_codes ON invite_codes.id = waitlist_signups.handled_invite_code_id
       WHERE waitlist_signups.id = ?`,
    )
    .get(signupId) as WaitlistSignupRow | undefined;
  if (!row) throw notFound("Waitlist signup not found");
  return row;
}

function getInviteCode(db: AppDatabase, inviteCodeId: number) {
  const row = db
    .prepare("SELECT id, code, usage_limit, default_role FROM invite_codes WHERE id = ?")
    .get(inviteCodeId) as InviteCodeRow | undefined;
  if (!row) throw notFound("Invite code not found");
  return row;
}

function assertSignupUnhandled(signup: WaitlistSignupRow) {
  if (signup.handled_at) throw badRequest("Waitlist signup is already handled");
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unique constraint failed")
  );
}

export function adminRoutes(
  db: AppDatabase,
  config: AppConfig,
  emailSender: EmailSender | null = null,
) {
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
    const rows = isOwnerRole(req.user?.role)
      ? (db
          .prepare(
            `SELECT id, name, email, role, team_id
             FROM users
             ORDER BY team_id, name COLLATE NOCASE`,
          )
          .all() as TeamUserRow[])
      : (db
          .prepare(
            `SELECT id, name, email, role, team_id
             FROM users
             WHERE team_id = ?
             ORDER BY name COLLATE NOCASE`,
          )
          .all(req.user?.teamId ?? 0) as TeamUserRow[]);

    res.json({ users: rows.map(userDto) });
  });

  router.get("/waitlist", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT waitlist_signups.id,
                waitlist_signups.name,
                waitlist_signups.email,
                waitlist_signups.created_at,
                waitlist_signups.updated_at,
                waitlist_signups.handled_at,
                waitlist_signups.handled_by_user_id,
                handled_by.name AS handled_by_name,
                waitlist_signups.handled_action,
                invite_codes.code AS invite_code,
                waitlist_signups.handled_user_id
         FROM waitlist_signups
         LEFT JOIN users AS handled_by ON handled_by.id = waitlist_signups.handled_by_user_id
         LEFT JOIN invite_codes ON invite_codes.id = waitlist_signups.handled_invite_code_id
         ORDER BY waitlist_signups.created_at DESC, waitlist_signups.id DESC
         LIMIT 50`,
      )
      .all() as WaitlistSignupRow[];

    res.json({ signups: rows.map(waitlistSignupDto) });
  });

  router.get("/login-events", (req, res) => {
    const rows = db
      .prepare(
        `SELECT user_login_events.id,
                user_login_events.user_id,
                users.name AS user_name,
                users.email AS user_email,
                user_login_events.created_at,
                user_login_events.ip_address,
                user_login_events.user_agent
         FROM user_login_events
         JOIN users ON users.id = user_login_events.user_id
         WHERE (? = 1 OR user_login_events.team_id = ?)
         ORDER BY user_login_events.created_at DESC, user_login_events.id DESC
         LIMIT 100`,
      )
      .all(isOwnerRole(req.user?.role) ? 1 : 0, req.user?.teamId ?? 0) as UserLoginEventRow[];

    res.json({ loginEvents: rows.map(loginEventDto) });
  });

  router.post("/waitlist/:signupId/invite-code", (req, res, next) => {
    try {
      const input = parseBody(req, waitlistInviteCodeInputSchema);
      const signupId = parseSignupId(req.params.signupId);
      const teamId = req.user?.teamId ?? 0;
      const adminId = req.user?.id ?? 0;

      const result = withTransaction(db, () => {
        const signup = getWaitlistSignup(db, signupId);
        assertSignupUnhandled(signup);

        const inviteResult = db
          .prepare(
            `INSERT INTO invite_codes (code, label, usage_limit, team_id, default_role)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            input.code,
            `Waitlist: ${signup.name} <${signup.email}>`,
            1,
            teamId,
            input.role,
          );
        const inviteCodeId = Number(inviteResult.lastInsertRowid);

        db.prepare(
          `UPDATE waitlist_signups
           SET handled_at = CURRENT_TIMESTAMP,
               handled_by_user_id = ?,
               handled_action = 'invite_code',
               handled_invite_code_id = ?,
               handled_user_id = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(adminId, inviteCodeId, signup.id);

        return {
          inviteCode: getInviteCode(db, inviteCodeId),
          signup: getWaitlistSignup(db, signup.id),
        };
      });

      res.status(201).json({
        inviteCode: inviteCodeDto(result.inviteCode),
        signup: waitlistSignupDto(result.signup),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        next(badRequest("Invite code already exists"));
        return;
      }

      next(error);
    }
  });

  router.post("/waitlist/:signupId/direct-user", async (req, res, next) => {
    try {
      const input = parseBody(req, waitlistDirectUserInputSchema);
      const signupId = parseSignupId(req.params.signupId);
      const teamId = req.user?.teamId ?? 0;
      const adminId = req.user?.id ?? 0;
      const passwordHash = await hashPassword(input.password);

      const result = withTransaction(db, () => {
        const signup = getWaitlistSignup(db, signupId);
        assertSignupUnhandled(signup);

        const user = insertUserWithPasswordHash(db, {
          name: signup.name,
          email: signup.email,
          passwordHash,
          teamId,
          role: input.role,
        });

        db.prepare(
          `UPDATE waitlist_signups
           SET handled_at = CURRENT_TIMESTAMP,
               handled_by_user_id = ?,
               handled_action = 'direct_user',
               handled_invite_code_id = NULL,
               handled_user_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(adminId, user.id, signup.id);

        return {
          user,
          signup: getWaitlistSignup(db, signup.id),
        };
      });

      await sendWelcomeEmail({ config, emailSender, user: result.user });

      res.status(201).json({
        user: userDto({
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          team_id: result.user.teamId,
        }),
        signup: waitlistSignupDto(result.signup),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users", async (req, res, next) => {
    try {
      const input = parseBody(req, userInputSchema);
      const user = await createUser(db, {
        ...input,
        teamId: req.user?.teamId ?? 0,
      });

      await sendWelcomeEmail({ config, emailSender, user });

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

      const existing = getVisibleUser(db, req, userId);
      if (existing.role === "owner" && !isOwnerRole(req.user?.role)) {
        throw badRequest("Owner access can only be changed by owner access");
      }
      if (
        (existing.role === "admin" || existing.role === "owner") &&
        input.role === "member" &&
        countTeamAdmins(db, existing.team_id) <= 1
      ) {
        throw badRequest("At least one admin is required");
      }

      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(input.role, userId);

      res.json({ user: userDto(getVisibleUser(db, req, userId)) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:userId/password", async (req, res, next) => {
    try {
      const input = parseBody(req, passwordResetInputSchema);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId < 1) throw notFound("User not found");

      getVisibleUser(db, req, userId);
      await resetUserPassword(db, userId, input.password);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:userId/impersonate", (req, res, next) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId < 1) throw notFound("User not found");
      if (userId === req.user?.id) {
        throw badRequest("Choose another user to impersonate");
      }

      const target = getVisibleUser(db, req, userId);
      if (target.role !== "member") {
        throw badRequest("Only members can be impersonated");
      }

      const user = startSessionImpersonation(db, req.headers.cookie, config, target.id);
      if (!user) throw badRequest("Session is no longer available");

      res.json({ user: authUserDto(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:userId/remove", (req, res, next) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId < 1) throw notFound("User not found");
      if (userId === req.user?.id) {
        throw badRequest("Use leave team to remove yourself");
      }

      getVisibleUser(db, req, userId);
      const movedUser = moveUserToPersonalTeam(db, userId, { revokeSessions: true });

      res.json({
        user: {
          id: movedUser.id,
          name: movedUser.name,
          email: movedUser.email,
          role: movedUser.role,
          teamId: movedUser.teamId,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
