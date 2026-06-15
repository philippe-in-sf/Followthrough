import { z } from "zod";
import type { AppDatabase } from "../db/database.js";
import { badRequest } from "../errors.js";
import { hashPassword } from "./password.js";

export const createUserInputSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

type InsertUserInput = {
  name: string;
  email: string;
  passwordHash: string;
};

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unique constraint failed")
  );
}

export async function createUser(db: AppDatabase, input: CreateUserInput) {
  const parsed = createUserInputSchema.parse(input);
  const passwordHash = await hashPassword(parsed.password);
  return insertUserWithPasswordHash(db, {
    name: parsed.name,
    email: parsed.email,
    passwordHash,
  });
}

export function insertUserWithPasswordHash(db: AppDatabase, input: InsertUserInput) {
  try {
    const result = db
      .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
      .run(input.name, input.email, input.passwordHash);

    return {
      id: Number(result.lastInsertRowid),
      name: input.name,
      email: input.email,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw badRequest("A user with that email already exists");
    }

    throw error;
  }
}
