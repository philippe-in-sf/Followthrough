import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("document shell", () => {
  it("uses followthrough as the browser tab title", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.querySelector("title")?.textContent).toBe("followthrough");
  });
});
