import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import type { AppConfig } from "../config.js";
import {
  identifiedEncryptionKey,
  type IdentifiedEncryptionKey,
} from "../cryptoKeys.js";

const ALGORITHM = "aes-256-gcm";
const FORMAT_PREFIX = "FTBACKUP:v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const IO_CHUNK_BYTES = 64 * 1024;
const MAX_HEADER_BYTES = 256;

type BackupEncryptionConfig = Pick<
  AppConfig,
  "backupEncryptionKey" | "backupEncryptionPreviousKeys"
>;

function keyRing(config: BackupEncryptionConfig) {
  if (!config.backupEncryptionKey.trim()) {
    throw new Error("BACKUP_ENCRYPTION_KEY is required when built-in backups are enabled");
  }

  const current = identifiedEncryptionKey(
    config.backupEncryptionKey,
    "BACKUP_ENCRYPTION_KEY",
  );
  const previous = config.backupEncryptionPreviousKeys.map((encoded, index) =>
    identifiedEncryptionKey(encoded, `BACKUP_ENCRYPTION_PREVIOUS_KEYS[${index}]`),
  );
  const keys = new Map<string, IdentifiedEncryptionKey>();
  for (const key of [current, ...previous]) keys.set(key.id, key);
  return { current, keys };
}

function writeBuffer(fd: number, value: Buffer) {
  if (value.length > 0) fs.writeSync(fd, value);
}

function temporaryOutputPath(outputPath: string) {
  return `${outputPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
}

export function assertBackupEncryptionConfigured(config: BackupEncryptionConfig) {
  keyRing(config);
}

export function encryptDatabaseBackupFile(
  plaintextPath: string,
  encryptedPath: string,
  config: BackupEncryptionConfig,
) {
  if (fs.existsSync(encryptedPath)) {
    throw new Error(`Encrypted backup already exists: ${encryptedPath}`);
  }
  const { current } = keyRing(config);
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.from(
    `${FORMAT_PREFIX}:${current.id}:${iv.toString("base64url")}\n`,
    "utf8",
  );
  const cipher = createCipheriv(ALGORITHM, current.value, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(header);

  const temporaryPath = temporaryOutputPath(encryptedPath);
  let inputFd: number | null = null;
  let outputFd: number | null = null;
  try {
    inputFd = fs.openSync(plaintextPath, "r");
    outputFd = fs.openSync(temporaryPath, "wx", 0o600);
    writeBuffer(outputFd, header);

    const buffer = Buffer.allocUnsafe(IO_CHUNK_BYTES);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(inputFd, buffer, 0, buffer.length, null)) > 0) {
      writeBuffer(outputFd, cipher.update(buffer.subarray(0, bytesRead)));
    }
    writeBuffer(outputFd, cipher.final());
    writeBuffer(outputFd, cipher.getAuthTag());
    fs.fsyncSync(outputFd);
    fs.closeSync(outputFd);
    outputFd = null;
    fs.renameSync(temporaryPath, encryptedPath);
    fs.chmodSync(encryptedPath, 0o600);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  } finally {
    if (inputFd !== null) fs.closeSync(inputFd);
    if (outputFd !== null) fs.closeSync(outputFd);
  }
}

function readHeader(fd: number) {
  const probe = Buffer.alloc(MAX_HEADER_BYTES);
  const bytesRead = fs.readSync(fd, probe, 0, probe.length, 0);
  const newlineIndex = probe.subarray(0, bytesRead).indexOf(0x0a);
  if (newlineIndex < 0) throw new Error("Encrypted backup header is malformed");

  const header = probe.subarray(0, newlineIndex + 1);
  const parts = header.toString("utf8").trimEnd().split(":");
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== FORMAT_PREFIX) {
    throw new Error("Encrypted backup header is malformed");
  }

  const [, , keyId, encodedIv] = parts;
  if (!/^[a-f0-9]{16}$/.test(keyId) || !/^[A-Za-z0-9_-]+$/.test(encodedIv)) {
    throw new Error("Encrypted backup header is malformed");
  }
  const iv = Buffer.from(encodedIv, "base64url");
  if (iv.length !== IV_BYTES) throw new Error("Encrypted backup header is malformed");
  return { header, keyId, iv };
}

export function decryptDatabaseBackupFile(
  encryptedPath: string,
  plaintextPath: string,
  config: BackupEncryptionConfig,
) {
  if (fs.existsSync(plaintextPath)) {
    throw new Error(`Backup restore destination already exists: ${plaintextPath}`);
  }
  const { keys } = keyRing(config);
  const temporaryPath = temporaryOutputPath(plaintextPath);
  let inputFd: number | null = null;
  let outputFd: number | null = null;
  try {
    inputFd = fs.openSync(encryptedPath, "r");
    const { header, keyId, iv } = readHeader(inputFd);
    const key = keys.get(keyId);
    if (!key) throw new Error(`Encrypted backup uses unavailable key ${keyId}`);

    const fileSize = fs.fstatSync(inputFd).size;
    const ciphertextLength = fileSize - header.length - AUTH_TAG_BYTES;
    if (ciphertextLength <= 0) throw new Error("Encrypted backup payload is malformed");

    const tag = Buffer.alloc(AUTH_TAG_BYTES);
    if (
      fs.readSync(inputFd, tag, 0, tag.length, fileSize - AUTH_TAG_BYTES) !==
      AUTH_TAG_BYTES
    ) {
      throw new Error("Encrypted backup payload is malformed");
    }

    const decipher = createDecipheriv(ALGORITHM, key.value, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);

    outputFd = fs.openSync(temporaryPath, "wx", 0o600);
    const buffer = Buffer.allocUnsafe(IO_CHUNK_BYTES);
    let position = header.length;
    const ciphertextEnd = fileSize - AUTH_TAG_BYTES;
    while (position < ciphertextEnd) {
      const requested = Math.min(buffer.length, ciphertextEnd - position);
      const bytesRead = fs.readSync(inputFd, buffer, 0, requested, position);
      if (bytesRead <= 0) throw new Error("Encrypted backup payload is truncated");
      position += bytesRead;
      writeBuffer(outputFd, decipher.update(buffer.subarray(0, bytesRead)));
    }
    writeBuffer(outputFd, decipher.final());
    fs.fsyncSync(outputFd);
    fs.closeSync(outputFd);
    outputFd = null;
    fs.renameSync(temporaryPath, plaintextPath);
    fs.chmodSync(plaintextPath, 0o600);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    if (error instanceof Error && /Encrypted backup/.test(error.message)) throw error;
    throw new Error("Encrypted backup authentication failed");
  } finally {
    if (inputFd !== null) fs.closeSync(inputFd);
    if (outputFd !== null) fs.closeSync(outputFd);
  }
}
