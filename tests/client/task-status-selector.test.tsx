import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskDto, TaskStatus } from "../../shared/types";
import { TasksPage } from "../../src/features/tasks/TasksPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("task list status selector", () => {
  it("updates status from the collapsed row without opening the task editor", async () => {
    let task: TaskDto = {
      publicId: "T001",
      description: "Send the launch notes",
      blockers: "",
      notes: "",
      blockersClearedAt: null,
      assignee: null,
      status: "Open",
      dueDate: "2026-08-08",
      originMeetingPublicId: null,
      originDecisionPublicId: null,
      seriesPublicId: null,
      reminderMode: "manual",
      lastReminderSentAt: null,
      alert: null,
      dependencies: [],
      private: false,
      archived: false,
    };
    let statusRequest: { status: TaskStatus } | null = null;

    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/people" && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ people: [] }) } as Response);
      }
      if (url === "/api/tasks" && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [task] }),
        } as Response);
      }
      if (url === "/api/tasks/T001/audit" && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ auditEvents: [] }),
        } as Response);
      }
      if (url === "/api/tasks/T001/status" && method === "PATCH") {
        statusRequest = JSON.parse(String(init?.body)) as { status: TaskStatus };
        task = { ...task, status: statusRequest.status };
        return Promise.resolve({
          ok: true,
          json: async () => ({ task }),
        } as Response);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    }) as typeof fetch;

    render(<TasksPage />);

    const selector = await screen.findByRole("combobox", { name: "Status for task T001" });
    const expandButton = screen.getByRole("button", {
      name: "Expand task T001 Send the launch notes",
    });
    expect(selector).toHaveValue("Open");
    expect(selector.closest("button")).toBeNull();
    expect(expandButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.selectOptions(selector, "In Progress");

    await waitFor(() => expect(statusRequest).toEqual({ status: "In Progress" }));
    expect(screen.getByRole("combobox", { name: "Status for task T001" })).toHaveValue(
      "In Progress",
    );
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Edit details for T001")).not.toBeInTheDocument();
  });
});
