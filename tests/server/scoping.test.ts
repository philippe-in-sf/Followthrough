import { describe, expect, it } from "vitest";
import { canMakePrivate, visibleRecordCondition } from "../../server/db/scoping";

/**
 * These assertions pin the record-visibility invariant. The exact SQL fragment
 * is relied on by hand-written queries across tasks, meetings, and people
 * routes, each of which binds a `userId` parameter for the single `?` it
 * contains. If the fragment changes shape (e.g. gains or loses a placeholder),
 * those call sites would bind the wrong parameter position — so a change here
 * should be deliberate and reviewed.
 */

describe("visibleRecordCondition", () => {
  it("scopes private tasks to their creator", () => {
    expect(visibleRecordCondition("tasks")).toBe(
      "(tasks.private = 0 OR tasks.created_by_user_id = ?)",
    );
  });

  it("scopes private meetings to their creator", () => {
    expect(visibleRecordCondition("meetings")).toBe(
      "(meetings.private = 0 OR meetings.created_by_user_id = ?)",
    );
  });

  it("contains exactly one bind placeholder", () => {
    for (const table of ["tasks", "meetings"] as const) {
      const placeholders = visibleRecordCondition(table).match(/\?/g) ?? [];
      expect(placeholders).toHaveLength(1);
    }
  });
});

describe("canMakePrivate", () => {
  it("allows the creator", () => {
    expect(canMakePrivate(7, 7)).toBe(true);
  });

  it("allows records with no recorded creator (legacy rows)", () => {
    expect(canMakePrivate(null, 7)).toBe(true);
  });

  it("forbids a non-creator", () => {
    expect(canMakePrivate(7, 8)).toBe(false);
  });
});
