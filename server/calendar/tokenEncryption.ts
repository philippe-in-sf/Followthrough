import type { AppConfig } from "../config.js";
import {
  assertSecretEncryptionConfigured,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "../secretEncryption.js";

export type DecryptedGoogleOAuthToken = {
  plaintext: string;
  needsReencryption: boolean;
};

function settings(config: AppConfig) {
  return {
    key: config.googleOAuthTokenEncryptionKey,
    previousKeys: config.googleOAuthTokenEncryptionPreviousKeys,
    keyLabel: "GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY",
    previousKeysLabel: "GOOGLE_OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS",
    subject: "Google OAuth token",
    missingKeyMessage:
      "GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is required to store Google OAuth tokens",
  };
}

export function assertGoogleOAuthTokenEncryptionConfigured(config: AppConfig) {
  assertSecretEncryptionConfigured(settings(config));
}

export function isEncryptedGoogleOAuthToken(value: string) {
  return isEncryptedSecret(value);
}

export function encryptGoogleOAuthToken(
  plaintext: string,
  config: AppConfig,
  context: string,
) {
  return encryptSecret(plaintext, settings(config), context);
}

export function decryptGoogleOAuthToken(
  storedValue: string,
  config: AppConfig,
  context: string,
): DecryptedGoogleOAuthToken {
  return decryptSecret(storedValue, settings(config), context);
}
