import { randomBytes } from "node:crypto";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSP_NONCE_PLACEHOLDER = "__CSP_NONCE__";

function parseOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function requestOrigin(req: Request) {
  return parseOrigin(`${req.protocol}://${req.get("host") ?? "localhost"}`);
}

function trustedOrigin(req: Request, config: AppConfig) {
  return parseOrigin(config.appBaseUrl) ?? requestOrigin(req);
}

export function baselineSecurityHeaders(config: AppConfig) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        connectSrc: [
          "'self'",
          "https://www.googletagmanager.com",
          "https://www.google.com",
          "https://*.google-analytics.com",
          "https://*.analytics.google.com",
          "https://consent.cookiebot.com",
          "https://consentcdn.cookiebot.com",
        ],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        frameSrc: [
          "'self'",
          "https://www.googletagmanager.com",
          "https://consentcdn.cookiebot.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://www.googletagmanager.com",
          "https://*.google-analytics.com",
          "https://imgsct.cookiebot.com",
          "https://consentcdn.cookiebot.com",
        ],
        objectSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`,
          "'strict-dynamic'",
          "https://www.googletagmanager.com",
          "https://consent.cookiebot.com",
          "https://consentcdn.cookiebot.com",
        ],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'"],
        ...(config.nodeEnv === "production" ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: config.nodeEnv === "production" ? undefined : false,
  });
}

export function assignCspNonce(_req: Request, res: Response, next: NextFunction) {
  res.locals.cspNonce = randomBytes(32).toString("base64");
  next();
}

export function applyCspNonceToHtml(html: string, nonce: string) {
  const withPlaceholdersReplaced = html.replaceAll(CSP_NONCE_PLACEHOLDER, nonce);
  return withPlaceholdersReplaced.replace(
    /<script(?![^>]*\bnonce=)([^>]*)>/gi,
    `<script nonce="${nonce}"$1>`,
  );
}

export function explicitCorsPolicy(config: AppConfig) {
  const configuredOrigin = parseOrigin(config.appBaseUrl);

  return cors({
    origin(origin, callback) {
      if (!origin || !configuredOrigin || parseOrigin(origin) !== configuredOrigin) {
        callback(null, false);
        return;
      }

      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  });
}

export function requireSameOrigin(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site")?.toLowerCase();
    const expectedOrigin = trustedOrigin(req, config);

    if (
      (origin && (!expectedOrigin || parseOrigin(origin) !== expectedOrigin)) ||
      (!origin && fetchSite === "cross-site") ||
      (!origin && config.nodeEnv === "production")
    ) {
      res.status(403).json({ error: "Cross-origin request blocked" });
      return;
    }

    next();
  };
}
