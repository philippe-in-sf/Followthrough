import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig } from "../../server/config";
import { applyCspNonceToHtml } from "../../server/security";

function packageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
    version?: unknown;
  };
  return packageJson.version;
}

function cspNonce(response: { headers: Record<string, string | string[] | undefined> }) {
  const policy = response.headers["content-security-policy"];
  const header = Array.isArray(policy) ? policy.join(";") : policy;
  const match = /'nonce-([^']+)'/.exec(header ?? "");
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

function expectEveryScriptHasNonce(html: string, nonce: string) {
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(script).toContain(`nonce="${nonce}"`);
  }
}

describe("public status endpoints", () => {
  it("returns ok", async () => {
    const app = createApp();
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["content-security-policy"]).toContain(
      "https://www.googletagmanager.com",
    );
    expect(response.headers["content-security-policy"]).toContain(
      "https://consent.cookiebot.com",
    );
    expect(response.headers["content-security-policy"]).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it("generates a distinct CSP nonce for every response", async () => {
    const app = createApp();
    const first = await request(app).get("/api/health");
    const second = await request(app).get("/api/health");

    expect(cspNonce(first)).not.toBe(cspNonce(second));
  });

  it("allows only the configured cross-origin caller", async () => {
    const app = createApp({
      config: { ...loadConfig(), appBaseUrl: "https://followthrough.example" },
    });

    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "https://followthrough.example");
    const denied = await request(app).get("/api/health").set("Origin", "https://attacker.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe("https://followthrough.example");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("blocks cross-origin state changes", async () => {
    const app = createApp({
      config: { ...loadConfig(), appBaseUrl: "https://followthrough.example" },
    });

    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://attacker.example");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Cross-origin request blocked" });
  });

  it("fails closed when any production mutation has no Origin", async () => {
    const app = createApp({
      config: {
        ...loadConfig(),
        nodeEnv: "production",
        appBaseUrl: "https://followthrough.example",
      },
    });

    const blocked = await request(app).post("/api/auth/logout");
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: "Cross-origin request blocked" });

    const sameOrigin = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", "tm_session=trusted-origin-token")
      .set("Origin", "https://followthrough.example");
    expect(sameOrigin.status).toBe(204);
  });

  it("returns the app version", async () => {
    const app = createApp();
    const response = await request(app).get("/api/version");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: packageVersion() });
  });

  it("serves the changelog publicly", async () => {
    const app = createApp();
    const markdown = await request(app).get("/api/changelog");
    const page = await request(app).get("/changelog");

    expect(markdown.status).toBe(200);
    expect(markdown.text).toContain("# Changelog");
    expect(markdown.text).toContain(`## ${packageVersion()}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Followthrough changelog");
    expect(page.text).toContain(`Current deployed package version: ${packageVersion()}`);
    expect(page.text).toContain("googletagmanager.com/gtm.js?id='+i+dl");
    expect(page.text).toContain("GTM-MW7M9JGM");
    expect(page.text).toContain("googletagmanager.com/ns.html?id=GTM-MW7M9JGM");
    expect(page.text).toContain("https://consent.cookiebot.com/uc.js");
    expect(page.text).toContain("1b43ed9f-c702-40a9-9db4-ad20277b7a12");
    expect(page.text).not.toContain("__CSP_NONCE__");
    expectEveryScriptHasNonce(page.text, cspNonce(page));
    expect(page.text).toContain("j.setAttribute('nonce'");
  });

  it("serves the privacy policy publicly", async () => {
    const app = createApp();
    const response = await request(app).get("/privacy");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Followthrough Privacy Policy");
    expect(response.text).toContain("IP address");
    expect(response.text).toContain("Google Calendar");
    expect(response.text).toContain("California residents");
    expect(response.text).toContain("We do not sell personal information");
    expect(response.text).toContain(`Current deployed package version: ${packageVersion()}`);
    expect(response.text).not.toContain("__CSP_NONCE__");
    expectEveryScriptHasNonce(response.text, cspNonce(response));
  });

  it("applies the response nonce to every SPA shell script", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
    const html = applyCspNonceToHtml(source, "test-response-nonce");

    expect(html).not.toContain("__CSP_NONCE__");
    expectEveryScriptHasNonce(html, "test-response-nonce");
    expect(html).toContain("j.setAttribute('nonce'");
  });
});
