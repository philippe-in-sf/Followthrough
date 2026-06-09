import type { Request } from "express";
import type { z } from "zod";
import { badRequest } from "./errors.js";

export function parseBody<T>(req: Request, schema: z.Schema<T>): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join("; "));
  }
  return result.data;
}
