import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import type { TeamDto, TeamUserDto } from "../../shared/types";

const originalFetch = globalThis.fetch;

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("admin page", () => {
  it("lets admins update team settings, add users, and change roles", async () => {
    let team: TeamDto = {
      id: 1,
      name: "Default Team",
      logoUrl: null,
      workCalendarUrl: null,
    };
    const users: TeamUserDto[] = [
      { id: 1, name: "Editor", email: "editor@example.com", role: "admin", teamId: 1 },
      { id: 2, name: "Member", email: "member@example.com", role: "member", teamId: 1 },
    ];
    vi.spyOn(window, "confirm").mockReturnValue(true);

    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://task-manager.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.pathname === "/api/auth/me") {
        return json({
          user: {
            id: 1,
            name: "Editor",
            email: "editor@example.com",
            role: "admin",
            team,
          },
        });
      }
      if (url.pathname === "/api/me/preferences") {
        return json({
          workCalendarUrl: null,
          googleCalendarConfigured: false,
          googleCalendarConnected: false,
          googleCalendarEmail: null,
        });
      }
      if (url.pathname === "/api/dashboard") {
        return json({
          alerts: { overdue: [], dueSoon: [] },
          openTasksByAssignee: [],
          activeBlockers: { tasks: [], meetings: [] },
          recentMeetings: [],
          recentDecisions: [],
          activeSeries: [],
        });
      }
      if (url.pathname === "/api/admin/team" && method === "GET") {
        return json({ team });
      }
      if (url.pathname === "/api/admin/team" && method === "PUT") {
        team = { id: team.id, ...body };
        return json({ team });
      }
      if (url.pathname === "/api/admin/users" && method === "GET") {
        return json({ users });
      }
      if (url.pathname === "/api/admin/users" && method === "POST") {
        const user = {
          id: 3,
          name: body.name,
          email: body.email,
          role: body.role,
          teamId: 1,
        };
        return json({ user }, 201);
      }
      const roleMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/role$/);
      if (roleMatch && method === "PATCH") {
        const user = users.find((candidate) => candidate.id === Number(roleMatch[1]));
        if (!user) return json({ error: "User not found" }, 404);
        user.role = body.role;
        return json({ user });
      }
      const removeMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/remove$/);
      if (removeMatch && method === "POST") {
        const userIndex = users.findIndex((candidate) => candidate.id === Number(removeMatch[1]));
        if (userIndex < 0) return json({ error: "User not found" }, 404);
        const [user] = users.splice(userIndex, 1);
        return json({ user: { ...user, role: "admin", teamId: 2 } });
      }

      return json({});
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Admin" }));

    await userEvent.clear(await screen.findByLabelText("Team name"));
    await userEvent.type(screen.getByLabelText("Team name"), "Acme Ops");
    await userEvent.type(screen.getByLabelText("Logo URL"), "https://example.com/logo.png");
    await userEvent.type(
      screen.getByLabelText("Shared calendar URL"),
      "https://calendar.example.com/team",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save team settings" }));

    await waitFor(() => expect(screen.getByText("Team settings saved")).toBeInTheDocument());
    expect(screen.getByText("Acme Ops")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open calendar shortcut" })).toHaveAttribute(
      "href",
      "https://calendar.example.com/team",
    );

    await userEvent.type(screen.getByLabelText("New user name"), "Second Admin");
    await userEvent.type(screen.getByLabelText("New user email"), "second@example.com");
    await userEvent.type(screen.getByLabelText("Temporary password"), "long-enough-password");
    await userEvent.selectOptions(screen.getByLabelText("New user role"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));

    expect(await screen.findByText("second@example.com")).toBeInTheDocument();

    const memberRow = screen.getByRole("row", { name: /member@example.com/i });
    await userEvent.selectOptions(within(memberRow).getByLabelText("Role for Member"), "admin");

    await waitFor(() =>
      expect(within(memberRow).getByLabelText("Role for Member")).toHaveValue("admin"),
    );

    await userEvent.click(within(memberRow).getByRole("button", { name: "Remove from team" }));

    await waitFor(() => expect(screen.queryByText("member@example.com")).not.toBeInTheDocument());
    expect(screen.getByText("Member removed from team")).toBeInTheDocument();
  });

  it("shows the last-admin error from role changes", async () => {
    const team: TeamDto = {
      id: 1,
      name: "Default Team",
      logoUrl: null,
      workCalendarUrl: null,
    };
    const users: TeamUserDto[] = [
      { id: 1, name: "Editor", email: "editor@example.com", role: "admin", teamId: 1 },
    ];

    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://task-manager.test");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/auth/me") {
        return json({
          user: {
            id: 1,
            name: "Editor",
            email: "editor@example.com",
            role: "admin",
            team,
          },
        });
      }
      if (url.pathname === "/api/me/preferences") {
        return json({
          workCalendarUrl: null,
          googleCalendarConfigured: false,
          googleCalendarConnected: false,
          googleCalendarEmail: null,
        });
      }
      if (url.pathname === "/api/dashboard") {
        return json({
          alerts: { overdue: [], dueSoon: [] },
          openTasksByAssignee: [],
          activeBlockers: { tasks: [], meetings: [] },
          recentMeetings: [],
          recentDecisions: [],
          activeSeries: [],
        });
      }
      if (url.pathname === "/api/admin/team") return json({ team });
      if (url.pathname === "/api/admin/users" && method === "GET") return json({ users });
      if (url.pathname === "/api/admin/users/1/role" && method === "PATCH") {
        return json({ error: "At least one admin is required" }, 400);
      }
      return json({});
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Admin" }));
    const editorRow = await screen.findByRole("row", { name: /editor@example.com/i });
    await userEvent.selectOptions(within(editorRow).getByLabelText("Role for Editor"), "member");

    expect(await screen.findByText("At least one admin is required")).toBeInTheDocument();
  });
});
