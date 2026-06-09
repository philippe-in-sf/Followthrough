import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { attachViteDevServer } from "./vite-dev.js";

const config = loadConfig();
const app = createApp();

if (config.nodeEnv === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(__dirname, "../client");
  app.use(express.static(clientDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
} else {
  await attachViteDevServer(app);
}

app.listen(config.port, () => {
  console.log(`Task manager listening on http://localhost:${config.port}`);
});
