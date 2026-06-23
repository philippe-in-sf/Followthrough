import express from "express";
import { requireAuth } from "./auth/authMiddleware.js";
import { authRoutes } from "./auth/routes.js";
import { googleCalendarRoutes } from "./calendar/routes.js";
import { readChangelog, renderChangelogHtml } from "./changelog.js";
import { loadConfig, type AppConfig } from "./config.js";
import { dashboardRoutes } from "./dashboard/routes.js";
import { decisionRoutes } from "./decisions/routes.js";
import type { AppDatabase } from "./db/database.js";
import { openDatabase } from "./db/database.js";
import { createEmailSender, type EmailSender } from "./email/mailer.js";
import { HttpError } from "./errors.js";
import { meetingRoutes } from "./meetings/routes.js";
import { peopleRoutes } from "./people/routes.js";
import { preferenceRoutes } from "./preferences/routes.js";
import { searchRoutes } from "./search/routes.js";
import { taskRoutes } from "./tasks/routes.js";
import { appVersion } from "./version.js";

export type AppDependencies = {
  db?: AppDatabase;
  config?: AppConfig;
  emailSender?: EmailSender | null;
};

export function createApp(deps: AppDependencies = {}) {
  const config = deps.config ?? loadConfig();
  const db = deps.db ?? openDatabase(config.databasePath);
  const emailSender = deps.emailSender ?? createEmailSender(config);
  const app = express();

  app.locals.db = db;
  app.locals.config = config;
  app.locals.emailSender = emailSender;
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/version", (_req, res) => {
    res.json({ version: appVersion });
  });

  app.get("/api/changelog", (_req, res) => {
    res.type("text/markdown").send(readChangelog());
  });

  app.get("/changelog", (_req, res) => {
    res.type("html").send(renderChangelogHtml(readChangelog(), appVersion));
  });

  app.use("/api/auth", authRoutes(db, config));

  const protectedApi = express.Router();
  protectedApi.use(requireAuth(db, config));
  const meetings = meetingRoutes(db, config);
  protectedApi.use("/dashboard", dashboardRoutes(db, config));
  protectedApi.use("/decisions", decisionRoutes(db));
  protectedApi.use("/google-calendar", googleCalendarRoutes(db, config));
  protectedApi.use("/me", preferenceRoutes(db, config));
  protectedApi.use("/meetings", meetings.meetingsRouter);
  protectedApi.use("/meeting-series", meetings.seriesRouter);
  protectedApi.use("/people", peopleRoutes(db));
  protectedApi.use("/search", searchRoutes(db));
  protectedApi.use("/tasks", taskRoutes(db, config, emailSender));
  app.use("/api", protectedApi);

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
