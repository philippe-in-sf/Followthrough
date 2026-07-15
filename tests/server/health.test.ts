import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { loadConfig } from "../../server/config";

function packageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
    version?: unknown;
  };
  return packageJson.version;
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
  });
});
