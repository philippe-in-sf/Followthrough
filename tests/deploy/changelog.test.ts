import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertChangelogHasVersion, findChangelogEntry } from "../../deploy/lib/changelog";

describe("changelog enforcement", () => {
  it("finds a release entry with bullets", () => {
    const markdown = [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- Pending work",
      "",
      "## 1.2.3 - 2026-06-16",
      "",
      "- Added something useful.",
      "",
      "## 1.2.2 - 2026-06-15",
      "",
      "- Fixed something boring.",
    ].join("\n");

    expect(findChangelogEntry(markdown, "1.2.3")).toContain("Added something useful");
  });

  it("rejects missing or empty release entries", () => {
    expect(() => assertChangelogHasVersion("9.9.9")).toThrow(/missing a release entry/);

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-test-"));
    const markdown = ["# Changelog", "", "## 1.2.3 - 2026-06-16", "", "### Added"].join(
      "\n",
    );
    fs.writeFileSync(path.join(cwd, "CHANGELOG.md"), markdown);

    try {
      expect(findChangelogEntry(markdown, "1.2.3")).toBeTruthy();
      expect(() => assertChangelogHasVersion("1.2.3", cwd)).toThrow(
        /must include at least one bullet/,
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
