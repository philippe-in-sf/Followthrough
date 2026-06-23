import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("document shell", () => {
  it("uses the marketing homepage browser tab title", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector("title")?.textContent).toBe(
      "Followthrough | Meeting task management",
    );
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      "meetings, decisions, owners, due dates, blockers, and reminders",
    );
  });

  it("loads Google Tag Manager at the top of the document shell", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

    expect(html.indexOf("<!-- Google Tag Manager -->")).toBeGreaterThan(html.indexOf("<head>"));
    expect(html.indexOf("<!-- Google Tag Manager -->")).toBeLessThan(
      html.indexOf('<meta charset="UTF-8" />'),
    );
    expect(html).toContain("GTM-MW7M9JGM");
    expect(html).toContain('id="Cookiebot"');
    expect(html).toContain("https://consent.cookiebot.com/uc.js");
    expect(html).toContain("1b43ed9f-c702-40a9-9db4-ad20277b7a12");
    expect(html.indexOf('id="Cookiebot"')).toBeLessThan(
      html.indexOf('<meta charset="UTF-8" />'),
    );
    expect(html.indexOf("<!-- Google Tag Manager (noscript) -->")).toBeGreaterThan(
      html.indexOf("<body>"),
    );
    expect(html.indexOf("<!-- Google Tag Manager (noscript) -->")).toBeLessThan(
      html.indexOf('<div id="root"></div>'),
    );
  });
});
