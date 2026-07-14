import { z } from "zod";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";
import { hashPassword } from "./password.js";
import { getAuthUserById, type UserRole } from "./sessions.js";

export const createUserInputSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12),
  teamId: z.number().int().positive().optional(),
  role: z.enum(["owner", "admin", "member"]).optional(),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

type InsertUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  teamId?: number;
  role?: UserRole;
};

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unique constraint failed")
  );
}

export async function createUser(db: AppDatabase, input: CreateUserInput) {
  const parsed = createUserInputSchema.parse(input);
  if (parsed.role === "owner" && parsed.email !== "philippe@beaudette.me") {
    throw badRequest("Owner access is reserved for philippe@beaudette.me");
  }
  const passwordHash = await hashPassword(parsed.password);
  return insertUserWithPasswordHash(db, {
    name: parsed.name,
    email: parsed.email,
    passwordHash,
    teamId: parsed.teamId,
    role: parsed.role ?? "admin",
  });
}

export function getDefaultTeamId(db: AppDatabase) {
  const team = db.prepare("SELECT id FROM teams ORDER BY id ASC LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!team) throw new Error("No team exists");
  return team.id;
}

export function insertUserWithPasswordHash(db: AppDatabase, input: InsertUserInput) {
  try {
    const teamId = input.teamId ?? getDefaultTeamId(db);
    const role = input.role ?? "admin";
    const result = db
      .prepare(
        "INSERT INTO users (name, email, password_hash, team_id, role) VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.name, input.email, input.passwordHash, teamId, role);

    const user = getAuthUserById(db, Number(result.lastInsertRowid));
    if (!user) throw new Error("Created user could not be loaded");
    return user;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw badRequest("A user with that email already exists");
    }

    throw error;
  }
}
