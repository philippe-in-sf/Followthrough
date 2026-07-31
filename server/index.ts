import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { startAuthCleanupJob } from "./auth/cleanupJob.js";
import type { AppDatabase } from "./db/database.js";
import type { EmailSender } from "./email/mailer.js";
import { loadConfig } from "./config.js";
import { startWorkspaceDigestJob } from "./dashboard/digestJob.js";
import { startDatabaseBackupJob } from "./db/backups.js";
import { startAutomaticTaskReminderJob } from "./tasks/reminderJob.js";
import { startTaskAutoArchiveJob } from "./tasks/archiveJob.js";
import { attachViteDevServer } from "./vite-dev.js";
import { applyCspNonceToHtml } from "./security.js";

const config = loadConfig();
const app = createApp({ config });
const authCleanupJob = startAuthCleanupJob(app.locals.db as AppDatabase, config);
const backupJob = startDatabaseBackupJob(app.locals.db as AppDatabase, config);
const reminderJob = startAutomaticTaskReminderJob(
  app.locals.db as AppDatabase,
  config,
  app.locals.emailSender as EmailSender | null,
);
const taskAutoArchiveJob = startTaskAutoArchiveJob(
  app.locals.db as AppDatabase,
  config,
);
const digestJob = startWorkspaceDigestJob(
  app.locals.db as AppDatabase,
  config,
  app.locals.emailSender as EmailSender | null,
);

if (config.nodeEnv === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(__dirname, "../client");
  const indexHtml = fs.readFileSync(path.join(clientDir, "index.html"), "utf8");
  const sendIndex = (_req: express.Request, res: express.Response) => {
    res
      .type("html")
      .send(applyCspNonceToHtml(indexHtml, res.locals.cspNonce));
  };

  app.get(["/", "/index.html"], sendIndex);
  app.use(express.static(clientDir, { index: false }));
  app.get(/.*/, sendIndex);
} else {
  await attachViteDevServer(app);
}

const server = app.listen(config.port, () => {
  console.log(`Task manager listening on http://localhost:${config.port}`);
});

process.on("SIGTERM", () => {
  authCleanupJob.stop();
  backupJob.stop();
  reminderJob.stop();
  taskAutoArchiveJob.stop();
  digestJob.stop();
  server.close(() => process.exit(0));
});
