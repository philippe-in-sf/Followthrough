import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";

const originalFetch = globalThis.fetch;
const currentUser = {
  id: 1,
  name: "Editor",
  email: "editor@example.com",
  role: "admin" as const,
  team: {
    id: 1,
    name: "Default Team",
    logoUrl: null,
    workCalendarUrl: null,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockLoggedInFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          user: currentUser,
        }),
      } as Response);
    }
    if (url.endsWith("/api/dashboard")) {
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
    if (url.endsWith("/api/people")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          people: [{ publicId: "P001", name: "Avery", email: null, archived: false }],
        }),
      } as Response);
    }
    if (url.startsWith("/api/tasks")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          tasks: [
            {
              publicId: "T001",
              description: "Send notes",
              blockers: "",
              blockersClearedAt: null,
              assignee: { publicId: "P001", name: "Avery", email: null, archived: false },
              status: "Open",
              dueDate: "2026-06-12",
              alert: "dueSoon",
              reminderMode: "automatic",
              lastReminderSentAt: null,
              archived: false,
            },
          ],
        }),
      } as Response);
    }
    if (url.endsWith("/api/decisions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          decisions: [
            {
              publicId: "D001",
              decisionText: "Use SQLite",
              decisionDate: "2026-06-09",
              context: "Single server",
              meetingPublicId: null,
              archived: false,
            },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  }) as typeof fetch;
}

describe("record pages", () => {
  it("shows people, tasks with alert badges, and decisions", async () => {
    mockLoggedInFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "People" }));
    expect(await screen.findByText("Avery")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(await screen.findByText("Send notes")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Task T001")).getByText("Due soon"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Decisions" }));
    expect(await screen.findByText("Use SQLite")).toBeInTheDocument();
  });

  it("adds people from the shared people form", async () => {
    const people: Array<{ publicId: string; name: string; email: string | null; archived: boolean }> =
      [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: currentUser,
          }),
        } as Response);
      }
      if (url.endsWith("/api/dashboard")) {
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
      if (url.endsWith("/api/people") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ people: [...people] }) } as Response);
      }
      if (url.endsWith("/api/people") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        people.push({
          publicId: "P001",
          name: body.name,
          email: body.email || null,
          archived: false,
        });
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ person: people[0] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "People" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Morgan");
    await userEvent.type(screen.getByLabelText("Email"), "morgan@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));

    expect(await screen.findByText("Morgan")).toBeInTheDocument();
  });

  it("edits people from the people display screen", async () => {
    const people: Array<{ publicId: string; name: string; email: string | null; archived: boolean }> = [
      { publicId: "P001", name: "Avery", email: "avery@example.com", archived: false },
    ];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: currentUser,
          }),
        } as Response);
      }
      if (url.endsWith("/api/dashboard")) {
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
      if (url.endsWith("/api/people") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ people: [...people] }) } as Response);
      }
      if (url.endsWith("/api/people/P001/audit") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            auditEvents: [
              {
                id: 1,
                entityType: "person",
                entityPublicId: "P001",
                action: "created",
                summary: "Created person",
                actorName: "Editor",
                createdAt: "2026-06-09 12:00:00",
                changes: { after: people[0] },
              },
            ],
          }),
        } as Response);
      }
      if (url.endsWith("/api/people/P001") && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        people[0] = {
          ...people[0],
          name: body.name,
          email: body.email || null,
        };
        return Promise.resolve({
          ok: true,
          json: async () => ({ person: people[0] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "People" }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit P001" }));

    const editForm = screen.getByRole("form", { name: "Edit P001" });
    expect(within(editForm).getByText("Audit history")).toBeInTheDocument();
    expect(within(editForm).getByText("Created person")).toBeInTheDocument();
    await userEvent.clear(within(editForm).getByLabelText("Name"));
    await userEvent.type(within(editForm).getByLabelText("Name"), "Avery Stone");
    await userEvent.clear(within(editForm).getByLabelText("Email"));
    await userEvent.type(within(editForm).getByLabelText("Email"), "avery.stone@example.com");
    await userEvent.click(within(editForm).getByRole("button", { name: "Save person" }));

    expect(await screen.findByText("Avery Stone")).toBeInTheDocument();
    expect(screen.getByText("avery.stone@example.com")).toBeInTheDocument();
  });

  it("archives a person from a single admin control", async () => {
    const people: Array<{ publicId: string; name: string; email: string | null; archived: boolean }> = [
      { publicId: "P001", name: "Avery", email: "avery@example.com", archived: false },
      { publicId: "P002", name: "Morgan", email: "morgan@example.com", archived: false },
    ];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: currentUser,
          }),
        } as Response);
      }
      if (url.endsWith("/api/dashboard")) {
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
      if (url.endsWith("/api/people") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ people: [...people] }) } as Response);
      }
      if (url.endsWith("/audit") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ auditEvents: [] }) } as Response);
      }
      if (url.endsWith("/api/people/P002/archive") && method === "POST") {
        people.splice(
          people.findIndex((person) => person.publicId === "P002"),
          1,
        );
        return Promise.resolve({ ok: true, status: 204 } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "People" }));
    expect(screen.queryByRole("button", { name: "Archive P002" })).not.toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText("Archive person"), "P002");
    await userEvent.click(screen.getByRole("button", { name: "Archive selected person" }));

    expect(window.confirm).toHaveBeenCalledWith("Archive Morgan?");
    await waitFor(() => expect(screen.queryByText("Morgan")).not.toBeInTheDocument());
    expect(screen.getByText("Avery")).toBeInTheDocument();
  });

  it("merges one person record into another from the people display screen", async () => {
    const people: Array<{ publicId: string; name: string; email: string | null; archived: boolean }> = [
      { publicId: "P001", name: "Avery", email: "avery@example.com", archived: false },
      { publicId: "P002", name: "Avery Duplicate", email: "avery.dup@example.com", archived: false },
    ];
    let mergeBody: unknown = null;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: currentUser,
          }),
        } as Response);
      }
      if (url.endsWith("/api/dashboard")) {
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
      if (url.endsWith("/api/people") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ people: [...people] }) } as Response);
      }
      if (url.endsWith("/audit") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ auditEvents: [] }) } as Response);
      }
      if (url.endsWith("/api/people/P002/merge") && method === "POST") {
        mergeBody = JSON.parse(String(init?.body));
        const sourcePerson = people.find((person) => person.publicId === "P002");
        people.splice(
          people.findIndex((person) => person.publicId === "P002"),
          1,
        );
        return Promise.resolve({
          ok: true,
          json: async () => ({
            movedMeetingAttendances: 0,
            movedTasks: 0,
            sourcePerson: { ...sourcePerson, archived: true },
            targetPerson: people[0],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "People" }));
    await userEvent.selectOptions(await screen.findByLabelText("Merge from"), "P002");
    await userEvent.selectOptions(screen.getByLabelText("Merge into"), "P001");
    await userEvent.click(screen.getByRole("button", { name: "Merge people" }));

    expect(window.confirm).toHaveBeenCalledWith("Merge Avery Duplicate into Avery?");
    expect(mergeBody).toEqual({ targetPublicId: "P001" });
    await waitFor(() => expect(screen.queryByText("Avery Duplicate")).not.toBeInTheDocument());
    expect(screen.getByText("Avery")).toBeInTheDocument();
  });

  it("shows related records when a person record is selected", async () => {
    const people = [
      { publicId: "P001", name: "Avery", email: "avery@example.com", archived: false },
    ];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: currentUser,
          }),
        } as Response);
      }
      if (url.endsWith("/api/dashboard")) {
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
      if (url.endsWith("/api/people") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ people }) } as Response);
      }
      if (url.endsWith("/api/people/P001/audit") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ auditEvents: [] }) } as Response);
      }
      if (url.endsWith("/api/people/P001/records") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            person: people[0],
            meetings: [
              {
                publicId: "M001",
                title: "Planning sync",
                blockers: "Waiting on launch deck",
                blockersClearedAt: null,
                startsAt: "2026-06-10T15:00:00.000Z",
                meetingType: "single",
                private: false,
              },
            ],
            tasks: [
              {
                publicId: "T001",
                description:
                  "Send notes (https://docs.google.com/presentation/d/example/edit#slide=id.g1)",
                blockers: "Need source notes",
                blockersClearedAt: null,
                status: "Open",
                dueDate: "2026-06-12",
                private: false,
              },
            ],
            decisions: [
              {
                publicId: "D001",
                decisionText: "Ship the launch plan",
                decisionDate: "2026-06-10",
                context: "Planning sync",
                meetingPublicId: "M001",
              },
            ],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "People" }));
    await userEvent.click(await screen.findByRole("button", { name: "View records for P001" }));

    const related = await screen.findByRole("region", { name: "Related records for P001" });
    expect(within(related).getByRole("heading", { name: "Meetings" })).toBeInTheDocument();
    expect(within(related).getByText("Planning sync")).toBeInTheDocument();
    expect(within(related).getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(related).toHaveTextContent("Send notes (Link)");
    expect(within(related).getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      "https://docs.google.com/presentation/d/example/edit#slide=id.g1",
    );
    expect(within(related).getByRole("heading", { name: "Decisions" })).toBeInTheDocument();
    expect(within(related).getByText("Ship the launch plan")).toBeInTheDocument();
  });
});
