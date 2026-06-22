import { describe, expect, it } from "vitest";
import { createReleaseId, runtimePaths } from "../../deploy/lib/release";

describe("deployment releases", () => {
  it("lists only runtime paths needed by the server", () => {
    expect(runtimePaths).toEqual([
      "dist",
      "package.json",
      "package-lock.json",
      "scripts",
      "CHANGELOG.md",
    ]);
  });

  it("requires a git sha", () => {
    const createReleaseIdWithoutSha = createReleaseId as (date: Date) => string;

    expect(() => createReleaseIdWithoutSha(new Date("2026-06-11T18:19:20.000Z"))).toThrow(
      /git sha/i,
    );
  });

  it("appends a short lowercase git sha from valid hex input", () => {
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"), "abcdef1234567890")).toBe(
      "20260611T181920Z-abcdef1",
    );
    expect(createReleaseId(new Date("2026-06-11T18:19:20.000Z"), "ABCDEF1234567890")).toBe(
      "20260611T181920Z-abcdef1",
    );
  });

  it("rejects malformed git sha input", () => {
    for (const gitSha of ["", " ", "abc/def xyz", "not-a-sha", "123456", "abcdefg"]) {
      expect(() => createReleaseId(new Date("2026-06-11T18:19:20.000Z"), gitSha)).toThrow(
        /git sha/i,
      );
    }
  });
});
