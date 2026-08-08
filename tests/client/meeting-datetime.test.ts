import { afterEach, describe, expect, it } from "vitest";
import {
  toApiDateTime,
  toApiMeetingDateTime,
  toDateTimeInputValue,
  toMeetingInputValue,
} from "../../src/features/meetings/dateTime";

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

  it("stores a date-only meeting without pretending midnight is meaningful", () => {
    expect(toApiMeetingDateTime("2026-08-08", "date")).toBe(
      "2026-08-08T12:00:00.000Z",
    );
    expect(toMeetingInputValue("2026-08-08T12:00:00.000Z", "date")).toBe("2026-08-08");
  });
});
