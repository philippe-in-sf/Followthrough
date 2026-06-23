import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/api/client";

const originalFetch = globalThis.fetch;

function json(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("calendar client preferences", () => {
  it("loads user preferences", async () => {
    globalThis.fetch = vi.fn(() =>
      json({
        workCalendarUrl: "https://calendar.example.com/team",
        googleOAuthRedirectUri: null,
      }),
    ) as typeof fetch;

    await expect(api.preferences.get()).resolves.toEqual({
      workCalendarUrl: "https://calendar.example.com/team",
      googleOAuthRedirectUri: null,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/me/preferences",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("updates the work calendar URL", async () => {
    globalThis.fetch = vi.fn(() =>
      json({
        workCalendarUrl: "https://calendar.example.com/team",
        googleOAuthRedirectUri: "http://localhost:3000/api/google-calendar/oauth/callback",
      }),
    ) as typeof fetch;

    await expect(
      api.preferences.update({ workCalendarUrl: "https://calendar.example.com/team" }),
    ).resolves.toEqual({
      workCalendarUrl: "https://calendar.example.com/team",
      googleOAuthRedirectUri: "http://localhost:3000/api/google-calendar/oauth/callback",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/me/preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ workCalendarUrl: "https://calendar.example.com/team" }),
      }),
    );
  });
});
