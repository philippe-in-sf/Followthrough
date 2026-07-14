import { randomBytes } from "node:crypto";
import { loadConfig } from "../config.js";
import { openDatabase } from "../db/database.js";
import { createUser } from "./userManagement.js";

function argValue(name: string) {
  const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : null;
}

const name = argValue("name");
const email = argValue("email");
const role = argValue("role") as "owner" | "admin" | "member" | null;
const teamId = argValue("team-id");
const suppliedPassword = argValue("password");
const password = suppliedPassword ?? randomBytes(18).toString("base64url");

if (!name || !email) {
  console.error(
    "Usage: npm run user:create -- --name=NAME --email=EMAIL [--password=PASSWORD] [--role=owner|admin|member] [--team-id=ID]",
  );
  process.exit(1);
}

const db = openDatabase(loadConfig().databasePath);

try {
  const user = await createUser(db, {
    name,
    email,
    password,
    role: role ?? undefined,
    teamId: teamId ? Number(teamId) : undefined,
  });
  console.log(`User created: ${user.email} (${user.role})`);
  if (!suppliedPassword) {
    console.log(`Temporary password: ${password}`);
  }
} finally {
  db.close();
}
