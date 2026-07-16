import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
    // The server-rendered public pages currently include inline analytics and
    // consent scripts. Add a nonce-based policy before enabling Helmet's CSP.
    contentSecurityPolicy: false,
    strictTransportSecurity: config.nodeEnv === "production" ? undefined : false,
  });
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

    // Browsers attach Origin to fetch/XHR state changes. Requests without
    // browser fetch metadata remain available to trusted scripts and tests.
    if (
      (origin && (!expectedOrigin || parseOrigin(origin) !== expectedOrigin)) ||
      (!origin && fetchSite === "cross-site")
    ) {
      res.status(403).json({ error: "Cross-origin request blocked" });
      return;
    }

    next();
  };
}
