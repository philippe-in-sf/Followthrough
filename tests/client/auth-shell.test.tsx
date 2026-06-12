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
  });

  it("logs in and shows the dashboard shell", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 1, name: "Editor", email: "editor@example.com" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alerts: { overdue: [], dueSoon: [] },
          openTasksByAssignee: [],
          recentMeetings: [],
          recentDecisions: [],
          activeSeries: [],
        }),
      } as Response);

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/email/i), "editor@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "long-enough-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("navigation")).toBeInTheDocument());
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(`Version ${appVersion}`)).toBeInTheDocument();
  });
});
