import express from "express";
import { authRoutes } from "./auth/routes.js";
import { loadConfig, type AppConfig } from "./config.js";
import type { AppDatabase } from "./db/database.js";
import { openDatabase } from "./db/database.js";
import { HttpError } from "./errors.js";

export type AppDependencies = {
  db?: AppDatabase;
  config?: AppConfig;
};

export function createApp(deps: AppDependencies = {}) {
  const config = deps.config ?? loadConfig();
  const db = deps.db ?? openDatabase(config.databasePath);
  const app = express();

  app.locals.db = db;
  app.locals.config = config;
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRoutes(db, config));

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
