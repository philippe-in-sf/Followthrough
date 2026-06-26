import { loadConfig } from "../config.js";
import { openDatabase } from "../db/database.js";
import { getDefaultTeamId } from "./userManagement.js";

const codeArg = process.argv.find((arg) => arg.startsWith("--code="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const labelArg = process.argv.find((arg) => arg.startsWith("--label="));
const roleArg = process.argv.find((arg) => arg.startsWith("--role="));
const teamIdArg = process.argv.find((arg) => arg.startsWith("--team-id="));

if (!codeArg) {
  console.error(
    "Usage: npm run invite:create -- --code=CODE [--limit=10] [--label=LABEL] [--role=admin|member] [--team-id=ID]",
  );
  process.exit(1);
}

const code = codeArg.split("=")[1];
const usageLimit = limitArg ? Number(limitArg.split("=")[1]) : null;
const label = labelArg ? labelArg.split("=")[1] : null;
const role = roleArg ? roleArg.split("=")[1] : "member";

const db = openDatabase(loadConfig().databasePath);
const teamId = teamIdArg ? Number(teamIdArg.split("=")[1]) : getDefaultTeamId(db);
db.prepare(
  "INSERT INTO invite_codes (code, label, usage_limit, team_id, default_role) VALUES (?, ?, ?, ?, ?)",
).run(
  code,
  label,
  usageLimit,
  teamId,
  role,
);
db.close();

console.log(`Invite code created: ${code}`);
