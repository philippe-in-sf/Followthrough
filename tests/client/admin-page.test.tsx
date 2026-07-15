import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import type { TeamDto, TeamUserDto, WaitlistSignupDto } from "../../shared/types";
import type { User } from "../../src/api/types";

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
  it("lets admins view the app as a member and return to admin mode", async () => {
    const team: TeamDto = {
      id: 1,
      name: "Default Team",
      logoUrl: null,
      workCalendarUrl: null,
    };
    const adminUser: User = {
      id: 1,
      name: "Editor",
      email: "editor@example.com",
      role: "admin",
      team,
      impersonation: null,
    };
    const memberUser: User = {
      id: 2,
      name: "Member",
      email: "member@example.com",
      role: "member",
      team,
      impersonation: {
        actor: {
          id: 1,
          name: "Editor",
          email: "editor@example.com",
          role: "admin",
        },
      },
    };
    const users: TeamUserDto[] = [
      { id: 1, name: "Editor", email: "editor@example.com", role: "admin", teamId: 1 },
      { id: 2, name: "Member", email: "member@example.com", role: "member", teamId: 1 },
    ];
    let currentUser: User = adminUser;
    vi.spyOn(window, "confirm").mockReturnValue(true);

    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://task-manager.test");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/auth/me") return json({ user: currentUser });
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
      if (url.pathname === "/api/admin/team" && method === "GET") return json({ team });
      if (url.pathname === "/api/admin/users" && method === "GET") return json({ users });
      if (url.pathname === "/api/admin/login-events" && method === "GET") {
        return json({ loginEvents: [] });
      }
      if (url.pathname === "/api/admin/waitlist" && method === "GET") {
        return json({ signups: [] });
      }
      if (url.pathname === "/api/admin/users/2/impersonate" && method === "POST") {
        currentUser = memberUser;
        return json({ user: memberUser });
      }
      if (url.pathname === "/api/auth/impersonation/stop" && method === "POST") {
        currentUser = adminUser;
        return json({ user: adminUser });
      }

      return json({});
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Admin" }));
    const memberRow = await screen.findByRole("row", { name: /member@example.com/i });
    await userEvent.click(within(memberRow).getByRole("button", { name: "View as user" }));

    const banner = await screen.findByRole("status");
    expect(within(banner).getByText(/Viewing as/)).toBeInTheDocument();
    expect(within(banner).getByText("Member")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Stop viewing as user" }));

    expect(await screen.findByRole("button", { name: "Admin" })).toBeInTheDocument();
  });

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
      if (url.pathname === "/api/admin/login-events" && method === "GET") {
        return json({
          loginEvents: [
            {
              id: 1,
              userId: 1,
              userName: "Editor",
              userEmail: "editor@example.com",
              createdAt: "2026-07-14T08:00:00.000Z",
              ipAddress: "127.0.0.1",
              userAgent: "Test Browser",
            },
          ],
        });
      }
      if (url.pathname === "/api/admin/waitlist" && method === "GET") {
        return json({ signups: [] });
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
      const passwordMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/password$/);
      if (passwordMatch && method === "POST") {
        expect(body).toEqual({ password: "reset-long-password" });
        return json({}, 204);
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
    expect(await screen.findByText("Login log")).toBeInTheDocument();
    expect(screen.getAllByText("editor@example.com").length).toBeGreaterThan(1);
    expect(screen.queryByText("127.0.0.1")).not.toBeInTheDocument();
    expect(screen.queryByText("Test Browser")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show IP and browser" }));
    expect(screen.getByText("127.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("Test Browser")).toBeInTheDocument();

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

    await userEvent.type(within(memberRow).getByLabelText("New password for Member"), "reset-long-password");
    await userEvent.click(within(memberRow).getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password reset for Member")).toBeInTheDocument();

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
      if (url.pathname === "/api/admin/login-events" && method === "GET") {
        return json({ loginEvents: [] });
      }
      if (url.pathname === "/api/admin/waitlist" && method === "GET") {
        return json({ signups: [] });
      }
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

  it("lets admins handle waitlist signups with invites or direct users", async () => {
    const team: TeamDto = {
      id: 1,
      name: "Default Team",
      logoUrl: null,
      workCalendarUrl: null,
    };
    const users: TeamUserDto[] = [
      { id: 1, name: "Editor", email: "editor@example.com", role: "admin", teamId: 1 },
    ];
    let signups: WaitlistSignupDto[] = [
      {
        id: 11,
        name: "Morgan Lee",
        email: "morgan@example.com",
        createdAt: "2026-06-29T14:00:00.000Z",
        updatedAt: "2026-06-29T14:00:00.000Z",
        handledAt: null,
        handledByUserId: null,
        handledByName: null,
        handledAction: null,
        inviteCode: null,
        createdUserId: null,
      },
      {
        id: 10,
        name: "Riley Chen",
        email: "riley@example.com",
        createdAt: "2026-06-29T13:00:00.000Z",
        updatedAt: "2026-06-29T13:00:00.000Z",
        handledAt: null,
        handledByUserId: null,
        handledByName: null,
        handledAction: null,
        inviteCode: null,
        createdUserId: null,
      },
    ];

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
      if (url.pathname === "/api/admin/team") return json({ team });
      if (url.pathname === "/api/admin/users" && method === "GET") return json({ users });
      if (url.pathname === "/api/admin/login-events" && method === "GET") {
        return json({ loginEvents: [] });
      }
      if (url.pathname === "/api/admin/waitlist" && method === "GET") {
        return json({ signups });
      }
      if (url.pathname === "/api/admin/waitlist/11/invite-code" && method === "POST") {
        expect(body).toEqual({ code: "morgan-code", role: "member" });
        signups = signups.map((signup) =>
          signup.id === 11
            ? {
                ...signup,
                handledAt: "2026-06-29T15:00:00.000Z",
                handledByUserId: 1,
                handledByName: "Editor",
                handledAction: "invite_code",
                inviteCode: "morgan-code",
              }
            : signup,
        );
        return json(
          {
            inviteCode: { id: 7, code: "morgan-code", usageLimit: 1, defaultRole: "member" },
            signup: signups[0],
          },
          201,
        );
      }
      if (url.pathname === "/api/admin/waitlist/10/direct-user" && method === "POST") {
        expect(body).toEqual({ password: "long-enough-password", role: "admin" });
        const user: TeamUserDto = {
          id: 4,
          name: "Riley Chen",
          email: "riley@example.com",
          role: "admin",
          teamId: 1,
        };
        users.push(user);
        signups = signups.map((signup) =>
          signup.id === 10
            ? {
                ...signup,
                handledAt: "2026-06-29T15:05:00.000Z",
                handledByUserId: 1,
                handledByName: "Editor",
                handledAction: "direct_user",
                createdUserId: user.id,
              }
            : signup,
        );
        return json({ user, signup: signups[1] }, 201);
      }
      return json({});
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Admin" }));

    const morganSignup = await screen.findByRole("listitem", {
      name: /Morgan Lee morgan@example.com/i,
    });
    await userEvent.clear(within(morganSignup).getByLabelText("Invite code for Morgan Lee"));
    await userEvent.type(within(morganSignup).getByLabelText("Invite code for Morgan Lee"), "morgan-code");
    await userEvent.click(
      within(morganSignup).getByRole("button", { name: "Create invite for Morgan Lee" }),
    );

    expect(
      await within(morganSignup).findByText("Handled with invite morgan-code by Editor"),
    ).toBeInTheDocument();

    const rileySignup = screen.getByRole("listitem", { name: /Riley Chen riley@example.com/i });
    await userEvent.type(
      within(rileySignup).getByLabelText("Temporary password for Riley Chen"),
      "long-enough-password",
    );
    await userEvent.selectOptions(within(rileySignup).getByLabelText("Direct user role for Riley Chen"), "admin");
    await userEvent.click(
      within(rileySignup).getByRole("button", { name: "Create user for Riley Chen" }),
    );

    expect(await within(rileySignup).findByText("Direct user created by Editor")).toBeInTheDocument();
  });
});
