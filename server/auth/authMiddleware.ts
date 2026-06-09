import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config.js";
import type { AppDatabase } from "../db/database.js";
import { getSessionUser, type AuthUser } from "./sessions.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(db: AppDatabase, config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getSessionUser(db, req.headers.cookie, config);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    req.user = user;
    next();
  };
}
