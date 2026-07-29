import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../src/api/types";
import { SettingsPage } from "../../src/features/settings/SettingsPage";

const originalFetch = globalThis.fetch;

const user: User = {
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

function renderSettings(overrides: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  return render(
    <SettingsPage
      user={user}
      workCalendarUrl={null}
      onWorkCalendarUrlChange={vi.fn()}
      googleCalendarConfigured={false}
      googleCalendarConnected={false}
      googleCalendarEmail={null}
      onGoogleCalendarConnectionChange={vi.fn()}
      onLeaveTeam={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("SettingsPage", () => {
  it("submits a password update", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/me/preferences") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workCalendarUrl: null,
            weeklyDigestEnabled: false,
            googleCalendarConfigured: false,
            googleCalendarConnected: false,
            googleCalendarEmail: null,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: init?.method === "POST" ? 204 : 200,
      } as Response);
    });
    globalThis.fetch = fetchMock;

    renderSettings();

    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-long-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "new-long-password");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/me/password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            currentPassword: "old-password",
            newPassword: "new-long-password",
          }),
        }),
      ),
    );
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("requires matching new passwords before submitting", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/me/preferences") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workCalendarUrl: null,
            weeklyDigestEnabled: false,
            googleCalendarConfigured: false,
            googleCalendarConnected: false,
            googleCalendarEmail: null,
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 204 } as Response);
    });
    globalThis.fetch = fetchMock;

    renderSettings();

    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-long-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different-password");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("New passwords do not match")).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain("/api/me/password");
  });

  it("moves the leave-team action into settings", async () => {
    const onLeaveTeam = vi.fn().mockResolvedValue(undefined);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          workCalendarUrl: null,
          weeklyDigestEnabled: false,
          googleCalendarConfigured: false,
          googleCalendarConnected: false,
          googleCalendarEmail: null,
        }),
      } as Response),
    ) as typeof fetch;

    renderSettings({ onLeaveTeam });

    await userEvent.click(screen.getByRole("button", { name: "Leave team" }));

    expect(onLeaveTeam).toHaveBeenCalledTimes(1);
  });

  it("saves the weekly digest opt-in", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/me/preferences" && init?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workCalendarUrl: null,
            weeklyDigestEnabled: true,
            googleCalendarConfigured: false,
            googleCalendarConnected: false,
            googleCalendarEmail: null,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          workCalendarUrl: null,
          weeklyDigestEnabled: false,
          googleCalendarConfigured: false,
          googleCalendarConnected: false,
          googleCalendarEmail: null,
        }),
      } as Response);
    });
    globalThis.fetch = fetchMock;

    renderSettings();

    await userEvent.click(await screen.findByLabelText("Email me the weekly workspace digest"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/me/preferences",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ workCalendarUrl: null, weeklyDigestEnabled: true }),
        }),
      ),
    );
    expect(await screen.findByText("Weekly digest enabled")).toBeInTheDocument();
  });

  it("saves and clears the calendar shortcut URL", async () => {
    const onWorkCalendarUrlChange = vi.fn();
    let workCalendarUrl: string | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/calendar-feed/connection") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ available: true, configured: false }),
        } as Response);
      }
      if (String(input) === "/api/me/preferences" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { workCalendarUrl?: string | null };
        workCalendarUrl = body.workCalendarUrl?.trim() || null;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          workCalendarUrl,
          weeklyDigestEnabled: false,
          googleCalendarConfigured: false,
          googleCalendarConnected: false,
          googleCalendarEmail: null,
        }),
      } as Response);
    });
    globalThis.fetch = fetchMock;

    renderSettings({ onWorkCalendarUrlChange });

    await userEvent.type(
      await screen.findByLabelText("Calendar shortcut URL"),
      "https://calendar.example.com/team",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save shortcut" }));

    expect(await screen.findByText("Calendar shortcut saved.")).toBeInTheDocument();
    expect(onWorkCalendarUrlChange).toHaveBeenLastCalledWith("https://calendar.example.com/team");

    await userEvent.click(screen.getByRole("button", { name: "Clear shortcut" }));

    expect(await screen.findByText("Calendar shortcut cleared.")).toBeInTheDocument();
    expect(onWorkCalendarUrlChange).toHaveBeenLastCalledWith(null);
  });

  it("disconnects a connected Google Calendar account", async () => {
    const onGoogleCalendarConnectionChange = vi.fn();
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/google-calendar/connection" && init?.method === "DELETE") {
        return Promise.resolve({ ok: true, status: 204 } as Response);
      }
      if (String(input) === "/api/calendar-feed/connection") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ available: true, configured: false }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          workCalendarUrl: null,
          weeklyDigestEnabled: false,
          googleCalendarConfigured: true,
          googleCalendarConnected: true,
          googleCalendarEmail: "editor@gmail.com",
        }),
      } as Response);
    }) as typeof fetch;

    renderSettings({
      googleCalendarConfigured: true,
      googleCalendarConnected: true,
      googleCalendarEmail: "editor@gmail.com",
      onGoogleCalendarConnectionChange,
    });

    expect(await screen.findByText("Connected as editor@gmail.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect Google Calendar" }));

    expect(onGoogleCalendarConnectionChange).toHaveBeenCalledWith(false, null);
    expect(await screen.findByText("Google Calendar disconnected.")).toBeInTheDocument();
  });

  it("saves a private iCalendar feed", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/calendar-feed/connection" && init?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ available: true, configured: true }),
        } as Response);
      }
      if (String(input) === "/api/calendar-feed/connection") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ available: true, configured: false }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          workCalendarUrl: null,
          weeklyDigestEnabled: false,
          googleCalendarConfigured: false,
          googleCalendarConnected: false,
          googleCalendarEmail: null,
        }),
      } as Response);
    });
    globalThis.fetch = fetchMock;

    renderSettings();

    await userEvent.type(
      await screen.findByLabelText("Private iCalendar feed URL"),
      "https://calendar.example.com/private.ics",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save feed" }));

    expect(await screen.findByText("Private iCalendar feed saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Private iCalendar feed URL")).toHaveValue("");
  });
});
