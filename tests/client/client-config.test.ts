import { describe, expect, it } from "vitest";
import { loadClientConfig } from "../../src/clientConfig";

describe("client config", () => {
  it("leaves the work calendar shortcut disabled by default", () => {
    expect(loadClientConfig({}).workCalendarUrl).toBeNull();
  });

  it("uses a configured http or https work calendar URL", () => {
    expect(loadClientConfig({ VITE_WORK_CALENDAR_URL: " https://calendar.example.com/team " }).workCalendarUrl).toBe(
      "https://calendar.example.com/team",
    );
    expect(loadClientConfig({ VITE_WORK_CALENDAR_URL: "http://calendar.internal/team" }).workCalendarUrl).toBe(
      "http://calendar.internal/team",
    );
  });

  it("rejects malformed or non-web work calendar URLs", () => {
    expect(loadClientConfig({ VITE_WORK_CALENDAR_URL: "calendar.example.com/team" }).workCalendarUrl).toBeNull();
    expect(loadClientConfig({ VITE_WORK_CALENDAR_URL: "javascript:alert(1)" }).workCalendarUrl).toBeNull();
  });
});
