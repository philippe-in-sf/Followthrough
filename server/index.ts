import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import type { AppDatabase } from "./db/database.js";
import type { EmailSender } from "./email/mailer.js";
import { loadConfig } from "./config.js";
import { startAutomaticTaskReminderJob } from "./tasks/reminderJob.js";
import { attachViteDevServer } from "./vite-dev.js";

const config = loadConfig();
const app = createApp({ config });
const reminderJob = startAutomaticTaskReminderJob(
  app.locals.db as AppDatabase,
  config,
  app.locals.emailSender as EmailSender | null,
);

if (config.nodeEnv === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(__dirname, "../client");
  app.use(express.static(clientDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
} else {
  await attachViteDevServer(app);
}

const server = app.listen(config.port, () => {
  console.log(`Task manager listening on http://localhost:${config.port}`);
});

process.on("SIGTERM", () => {
  reminderJob.stop();
  server.close(() => process.exit(0));
});
