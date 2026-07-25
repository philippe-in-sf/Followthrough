import path from "node:path";
import { loadConfig } from "../config.js";
import { decryptDatabaseBackupFile } from "./backupEncryption.js";

const [, , encryptedPathArg, plaintextPathArg] = process.argv;
if (!encryptedPathArg || !plaintextPathArg) {
  console.error(
    "Usage: npm run backup:decrypt -- <encrypted-backup.sqlite.enc> <restored.sqlite>",
  );
  process.exit(1);
}

const encryptedPath = path.resolve(encryptedPathArg);
const plaintextPath = path.resolve(plaintextPathArg);
decryptDatabaseBackupFile(encryptedPath, plaintextPath, loadConfig());
console.log(`Decrypted database backup to ${plaintextPath}`);
