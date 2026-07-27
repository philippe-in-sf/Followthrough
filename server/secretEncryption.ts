import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  identifiedEncryptionKey,
  type IdentifiedEncryptionKey,
} from "./cryptoKeys.js";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_PREFIX = "enc:v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type SecretEncryptionSettings = {
  key: string;
  previousKeys: string[];
  keyLabel: string;
  previousKeysLabel: string;
  subject: string;
  missingKeyMessage: string;
};

export type DecryptedSecret = {
  plaintext: string;
  needsReencryption: boolean;
};

function keyRing(settings: SecretEncryptionSettings) {
  if (!settings.key.trim()) {
    throw new Error(settings.missingKeyMessage);
  }

  const current = identifiedEncryptionKey(settings.key, settings.keyLabel);
  const previous = settings.previousKeys.map((encoded, index) =>
    identifiedEncryptionKey(
      encoded,
      `${settings.previousKeysLabel}[${index}]`,
    ),
  );
  const keys = new Map<string, IdentifiedEncryptionKey>();
  for (const key of [current, ...previous]) keys.set(key.id, key);
  return { current, keys };
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string, label: string, subject: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${subject} ${label} is malformed`);
  }
  return Buffer.from(value, "base64url");
}

export function assertSecretEncryptionConfigured(settings: SecretEncryptionSettings) {
  keyRing(settings);
}

export function isEncryptedSecret(value: string) {
  return value.startsWith("enc:");
}

export function encryptSecret(
  plaintext: string,
  settings: SecretEncryptionSettings,
  context: string,
) {
  if (!plaintext) throw new Error(`${settings.subject}s cannot be empty`);
  const { current } = keyRing(settings);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, current.value, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_PREFIX, current.id, encode(iv), encode(tag), encode(ciphertext)].join(":");
}

export function decryptSecret(
  storedValue: string,
  settings: SecretEncryptionSettings,
  context: string,
): DecryptedSecret {
  const { current, keys } = keyRing(settings);
  if (!isEncryptedSecret(storedValue)) {
    return { plaintext: storedValue, needsReencryption: true };
  }

  const parts = storedValue.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    throw new Error(`${settings.subject} ciphertext is malformed`);
  }

  const [, , keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const key = keys.get(keyId);
  if (!key) {
    throw new Error(`${settings.subject} uses unavailable encryption key ${keyId}`);
  }

  const iv = decode(encodedIv, "IV", settings.subject);
  const tag = decode(encodedTag, "authentication tag", settings.subject);
  const ciphertext = decode(encodedCiphertext, "ciphertext", settings.subject);
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error(`${settings.subject} ciphertext is malformed`);
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
    throw new Error(`${settings.subject} authentication failed`);
  }
}
