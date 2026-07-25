import { createHash } from "node:crypto";

const AES_256_KEY_BYTES = 32;

export type IdentifiedEncryptionKey = {
  id: string;
  value: Buffer;
};

export function decodeBase64EncryptionKey(encoded: string, settingName: string) {
  const value = encoded.trim();
  if (!value || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    throw new Error(`${settingName} must be a base64-encoded 32-byte key`);
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== AES_256_KEY_BYTES) {
    throw new Error(`${settingName} must decode to exactly 32 bytes`);
  }
  return key;
}

export function identifiedEncryptionKey(
  encoded: string,
  settingName: string,
): IdentifiedEncryptionKey {
  const value = decodeBase64EncryptionKey(encoded, settingName);
  return {
    id: createHash("sha256").update(value).digest("hex").slice(0, 16),
    value,
  };
}
