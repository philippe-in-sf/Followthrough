import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockLoggedInFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          user: { id: 1, name: "Editor", email: "editor@example.com" },
        }),
      } as Response);
    }
    if (url.endsWith("/api/dashboard")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          alerts: { overdue: [], dueSoon: [] },
          openTasksByAssignee: [],
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
              assignee: { publicId: "P001", name: "Avery", email: null, archived: false },
              status: "Open",
              dueDate: "2026-06-12",
              alert: "dueSoon",
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
    expect(screen.getAllByText(/due soon/i)).toHaveLength(2);

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
            user: { id: 1, name: "Editor", email: "editor@example.com" },
          }),
        } as Response);
      }
      if (url.endsWith("/api/dashboard")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            alerts: { overdue: [], dueSoon: [] },
            openTasksByAssignee: [],
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
});
