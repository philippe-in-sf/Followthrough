import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";

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
  });
});
