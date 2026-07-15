import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

const rateLimitResponse = {
  error: "Too many authentication attempts. Try again later.",
};

function normalizedEmailKey(req: Request) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "invalid";
  return `email:${email}`;
}

function authLimiter(options: {
  windowMs: number;
  limit: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    keyGenerator: options.keyGenerator ?? ((req) => ipKeyGenerator(req.ip ?? "unknown")),
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: rateLimitResponse,
  });
}

export function createAuthRateLimits() {
  return {
    loginIp: authLimiter({
      windowMs: FIFTEEN_MINUTES,
      limit: 20,
      skipSuccessfulRequests: true,
    }),
    loginEmail: authLimiter({
      windowMs: FIFTEEN_MINUTES,
      limit: 10,
      keyGenerator: normalizedEmailKey,
      skipSuccessfulRequests: true,
    }),
    signup: authLimiter({
      windowMs: ONE_HOUR,
      limit: 10,
    }),
    passwordResetRequest: authLimiter({
      windowMs: ONE_HOUR,
      limit: 5,
    }),
    passwordResetConfirm: authLimiter({
      windowMs: FIFTEEN_MINUTES,
      limit: 10,
    }),
  };
}
