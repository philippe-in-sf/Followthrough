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

    render(<SettingsPage user={user} onLeaveTeam={vi.fn()} />);

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

    render(<SettingsPage user={user} onLeaveTeam={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-long-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different-password");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("New passwords do not match")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

    render(<SettingsPage user={user} onLeaveTeam={onLeaveTeam} />);

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

    render(<SettingsPage user={user} onLeaveTeam={vi.fn()} />);

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
});
