import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { AppConfig } from "../config.js";
import {
  identifiedEncryptionKey,
  type IdentifiedEncryptionKey,
} from "../cryptoKeys.js";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_PREFIX = "enc:v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type DecryptedGoogleOAuthToken = {
  plaintext: string;
  needsReencryption: boolean;
};

function keyRing(config: AppConfig) {
  if (!config.googleOAuthTokenEncryptionKey.trim()) {
    throw new Error(
      "GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is required to store Google OAuth tokens",
    );
  }

  const current = identifiedEncryptionKey(
    config.googleOAuthTokenEncryptionKey,
    "GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY",
  );
  const previous = config.googleOAuthTokenEncryptionPreviousKeys.map((encoded, index) =>
    identifiedEncryptionKey(
      encoded,
      `GOOGLE_OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS[${index}]`,
    ),
  );
  const keys = new Map<string, IdentifiedEncryptionKey>();
  for (const key of [current, ...previous]) keys.set(key.id, key);
  return { current, keys };
}

export function assertGoogleOAuthTokenEncryptionConfigured(config: AppConfig) {
  keyRing(config);
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Google OAuth token ${label} is malformed`);
  }
  return Buffer.from(value, "base64url");
}

export function isEncryptedGoogleOAuthToken(value: string) {
  return value.startsWith("enc:");
}

export function encryptGoogleOAuthToken(
  plaintext: string,
  config: AppConfig,
  context: string,
) {
  if (!plaintext) throw new Error("Google OAuth tokens cannot be empty");
  const { current } = keyRing(config);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, current.value, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_PREFIX, current.id, encode(iv), encode(tag), encode(ciphertext)].join(":");
}

export function decryptGoogleOAuthToken(
  storedValue: string,
  config: AppConfig,
  context: string,
): DecryptedGoogleOAuthToken {
  const { current, keys } = keyRing(config);
  if (!isEncryptedGoogleOAuthToken(storedValue)) {
    return { plaintext: storedValue, needsReencryption: true };
  }

  const parts = storedValue.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    throw new Error("Google OAuth token ciphertext is malformed");
  }

  const [, , keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const key = keys.get(keyId);
  if (!key) {
    throw new Error(`Google OAuth token uses unavailable encryption key ${keyId}`);
  }

  const iv = decode(encodedIv, "IV");
  const tag = decode(encodedTag, "authentication tag");
  const ciphertext = decode(encodedCiphertext, "ciphertext");
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error("Google OAuth token ciphertext is malformed");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key.value, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
    return { plaintext, needsReencryption: key.id !== current.id };
  } catch {
    throw new Error("Google OAuth token authentication failed");
  }
}
