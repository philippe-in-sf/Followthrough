import { afterEach, describe, expect, it } from "vitest";
import { toApiDateTime, toDateTimeInputValue } from "../../src/features/meetings/dateTime";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimeZone;
});

describe("meeting date time conversion", () => {
  it("shows API times as local datetime input values before saving them back", () => {
    process.env.TZ = "America/Chicago";

    const apiValue = "2026-06-29T17:00:00.000Z";
    const inputValue = toDateTimeInputValue(apiValue);

    expect(inputValue).toBe("2026-06-29T12:00");
    expect(toApiDateTime(inputValue)).toBe(apiValue);
  });
});
