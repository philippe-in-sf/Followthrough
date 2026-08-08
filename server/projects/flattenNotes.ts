import { loadConfig } from "../config.js";
import { openDatabase } from "../db/database.js";
import { flattenProjectNotes } from "./store.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
try {
  const result = flattenProjectNotes(db);
  console.log(
    `Flattened ${result.notesFlattened} project note(s) into ${result.meetingsChanged} meeting(s).`,
  );
} finally {
  db.close();
}
