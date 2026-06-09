import { loadConfig } from "../config.js";
import { openDatabase } from "../db/database.js";

const codeArg = process.argv.find((arg) => arg.startsWith("--code="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const labelArg = process.argv.find((arg) => arg.startsWith("--label="));

if (!codeArg) {
  console.error("Usage: npm run invite:create -- --code=CODE [--limit=10] [--label=LABEL]");
  process.exit(1);
}

const code = codeArg.split("=")[1];
const usageLimit = limitArg ? Number(limitArg.split("=")[1]) : null;
const label = labelArg ? labelArg.split("=")[1] : null;

const db = openDatabase(loadConfig().databasePath);
db.prepare("INSERT INTO invite_codes (code, label, usage_limit) VALUES (?, ?, ?)").run(
  code,
  label,
  usageLimit,
);
db.close();

console.log(`Invite code created: ${code}`);
