import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import type { User } from "../../src/api/types";
import { appVersion } from "../../src/version";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("auth shell", () => {
  it("shows compact access panels when there is no current user", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    } as Response);

    render(<App />);

    expect(await screen.findByRole("button", { name: "Account access" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Join the waiting list" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText(/Followthrough is currently in private beta/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Join the waiting list/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email$/i)).not.toBeVisible();
    expect(screen.getByLabelText(/email address/i)).not.toBeVisible();
    expect(screen.getByRole("link", { name: "Changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
  });

  it("submits a public beta waitlist request", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") {
        return Promise.resolve({ ok: true, json: async () => ({ user: null }) } as Response);
      }
      if (path === "/api/waitlist") {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;
    globalThis.fetch = fetchMock;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Join the waiting list" }));
    const waitlist = screen.getByRole("region", { name: "Join the waiting list" });
    await userEvent.type(within(waitlist).getByLabelText(/your name/i), "Morgan Lee");
    await userEvent.type(within(waitlist).getByLabelText(/email address/i), "morgan@example.com");
    await userEvent.click(within(waitlist).getByRole("button", { name: /Join waiting list/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/waitlist",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Morgan Lee", email: "morgan@example.com" }),
        }),
      ),
    );
    expect(await within(waitlist).findByText(/You're on the waiting list/i)).toBeInTheDocument();
  });

  it("logs in and shows the dashboard shell", async () => {
    let user: User | null = null;
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") {
        return Promise.resolve({ ok: true, json: async () => ({ user }) } as Response);
      }
      if (path === "/api/auth/login") {
        user = {
          id: 1,
          name: "Editor",
          email: "editor@example.com",
          role: "admin",
          team: {
            id: 1,
            name: "Default Team",
            logoUrl: null,
            workCalendarUrl: null,
          },
        };
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

    await userEvent.click(await screen.findByRole("button", { name: "Account access" }));
    const authPanel = screen.getByRole("region", { name: "Account access" });
    expect(within(authPanel).queryByRole("link", { name: "Changelog" })).not.toBeInTheDocument();
    await userEvent.type(within(authPanel).getByLabelText(/^Email$/i), "editor@example.com");
    await userEvent.type(within(authPanel).getByLabelText(/password/i), "long-enough-password");
    await userEvent.click(within(authPanel).getByRole("button", { name: /sign in/i }));

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
  });

  it("requests a password reset from account access", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://task-manager.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.pathname === "/api/auth/me") {
        return Promise.resolve({ ok: true, json: async () => ({ user: null }) } as Response);
      }
      if (url.pathname === "/api/auth/password-reset/request" && method === "POST") {
        expect(body).toEqual({ email: "editor@example.com" });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;
    globalThis.fetch = fetchMock;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Account access" }));
    const authPanel = screen.getByRole("region", { name: "Account access" });
    await userEvent.click(within(authPanel).getByRole("button", { name: "Reset password" }));
    await userEvent.type(within(authPanel).getByLabelText(/^Email$/i), "editor@example.com");
    await userEvent.click(within(authPanel).getByRole("button", { name: "Send reset link" }));

    expect(
      await within(authPanel).findByText("If that email has access, a reset link is on its way."),
    ).toBeInTheDocument();
  });
});
