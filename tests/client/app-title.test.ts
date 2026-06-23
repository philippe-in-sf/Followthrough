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
});
