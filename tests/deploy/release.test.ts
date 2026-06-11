import { describe, expect, it } from "vitest";
import { createReleaseId, runtimePaths } from "../../deploy/lib/release";

describe("deployment releases", () => {
  it("lists only runtime paths needed by the server", () => {
    expect(runtimePaths).toEqual(["dist", "package.json", "package-lock.json"]);
  });

  it("creates a timestamp release id without a git sha", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"))).toBe("20260611T181920Z");
  });

  it("appends a short git sha when available", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"), "abcdef1234567890")).toBe(
      "20260611T181920Z-abcdef1",
    );
  });

  it("removes unsafe characters from the git sha", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"), "abc/def xyz")).toBe(
      "20260611T181920Z-abcdefx",
    );
  });
});
