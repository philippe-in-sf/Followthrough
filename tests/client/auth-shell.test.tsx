import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { appVersion } from "../../src/version";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("auth shell", () => {
  it("shows login when there is no current user", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    } as Response);

    render(<App />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("logs in and shows the dashboard shell", async () => {
    let user: { id: number; name: string; email: string } | null = null;
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") {
        return Promise.resolve({ ok: true, json: async () => ({ user }) } as Response);
      }
      if (path === "/api/auth/login") {
        user = { id: 1, name: "Editor", email: "editor@example.com" };
        return Promise.resolve({ ok: true, json: async () => ({ user }) } as Response);
      }
      if (path === "/api/me/preferences") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            workCalendarUrl: null,
            googleCalendarConfigured: true,
            googleCalendarConnected: false,
            googleCalendarEmail: null,
          }),
        } as Response);
      }
      if (path === "/api/dashboard") {
        return Promise.resolve({
        ok: true,
        json: async () => ({
          alerts: { overdue: [], dueSoon: [] },
          openTasksByAssignee: [],
          activeBlockers: { tasks: [], meetings: [] },
          recentMeetings: [],
          recentDecisions: [],
          activeSeries: [],
        }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/email/i), "editor@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "long-enough-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Primary sections" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText(`Version ${appVersion}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
    expect(screen.getByRole("link", { name: "Open privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});
