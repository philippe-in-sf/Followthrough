import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DecisionDto,
  MeetingDto,
  MeetingSeriesDto,
  PersonDto,
  TaskDto,
} from "../../shared/types";
import { App } from "../../src/App";

const originalFetch = globalThis.fetch;

const avery: PersonDto = {
  publicId: "P001",
  name: "Avery",
  email: "avery@example.com",
  archived: false,
};

function json(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function setupAppFetch() {
  const tasks: TaskDto[] = [
    {
      publicId: "T099",
      description: "Prep launch plan",
      assignee: avery,
      status: "Open",
      dueDate: "2026-06-08",
      originMeetingPublicId: null,
      seriesPublicId: null,
      alert: "overdue",
      archived: false,
    },
    {
      publicId: "T010",
      description: "Carry roadmap",
      assignee: avery,
      status: "In Progress",
      dueDate: "2026-06-15",
      originMeetingPublicId: "M010",
      seriesPublicId: "S001",
      alert: "dueSoon",
      archived: false,
    },
  ];

  const decisions: DecisionDto[] = [
    {
      publicId: "D001",
      decisionText: "Use SQLite",
      decisionDate: "2026-06-09",
      context: "Single server",
      meetingPublicId: "M010",
      archived: false,
    },
  ];

  const series: MeetingSeriesDto[] = [
    {
      publicId: "S001",
      title: "Project sync",
      cadenceLabel: "Weekly",
      active: true,
      archived: false,
    },
  ];

  const meetings: MeetingDto[] = [
    {
      publicId: "M010",
      title: "Leadership sync",
      startsAt: "2026-06-09T15:00:00.000Z",
      meetingType: "recurring",
      seriesPublicId: "S001",
      summary: "Launch readiness",
      attendees: [avery],
      tasks: [tasks[1]],
      archived: false,
    },
  ];

  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://task-manager.test");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url.pathname === "/api/auth/me") {
      return json({ user: { id: 1, name: "Editor", email: "editor@example.com" } });
    }

    if (url.pathname === "/api/dashboard") {
      return json({
        alerts: {
          overdue: tasks.filter((task) => task.alert === "overdue"),
          dueSoon: tasks.filter((task) => task.alert === "dueSoon"),
        },
        openTasksByAssignee: [{ assignee: avery, tasks }],
        recentMeetings: meetings.map((meeting) => ({
          publicId: meeting.publicId,
          title: meeting.title,
          startsAt: meeting.startsAt,
        })),
        recentDecisions: decisions.map((decision) => ({
          publicId: decision.publicId,
          decisionText: decision.decisionText,
          decisionDate: decision.decisionDate,
        })),
        activeSeries: series,
      });
    }

    if (url.pathname === "/api/search") {
      return json({
        results: [
          {
            type: "task",
            publicId: "T099",
            title: "Prep launch plan",
            subtitle: "Exact ID match",
          },
        ],
      });
    }

    if (url.pathname === "/api/people") return json({ people: [avery] });

    if (url.pathname === "/api/tasks" && method === "GET") return json({ tasks });

    if (url.pathname === "/api/tasks" && method === "POST") {
      const task = {
        publicId: "T100",
        description: body.description,
        assignee: avery,
        status: body.status,
        dueDate: body.dueDate,
        originMeetingPublicId: null,
        seriesPublicId: null,
        alert: null,
        archived: false,
      };
      tasks.push(task);
      return json({ task }, 201);
    }

    if (url.pathname === "/api/tasks/T099" && method === "PATCH") {
      tasks[0] = { ...tasks[0], description: body.description, status: body.status };
      return json({ task: tasks[0] });
    }

    if (url.pathname === "/api/decisions" && method === "GET") return json({ decisions });

    if (url.pathname === "/api/decisions" && method === "POST") {
      const decision = {
        publicId: "D100",
        decisionText: body.decisionText,
        decisionDate: body.decisionDate,
        context: body.context,
        meetingPublicId: body.meetingPublicId,
        archived: false,
      };
      decisions.push(decision);
      return json({ decision }, 201);
    }

    if (url.pathname === "/api/meeting-series" && method === "GET") return json({ series });

    if (url.pathname === "/api/meeting-series" && method === "POST") {
      const meetingSeries = {
        publicId: "S002",
        title: body.title,
        cadenceLabel: body.cadenceLabel,
        active: body.active,
        archived: false,
      };
      series.push(meetingSeries);
      return json({ series: meetingSeries }, 201);
    }

    if (url.pathname === "/api/meeting-series/S001/occurrences" && method === "POST") {
      const meeting: MeetingDto = {
        publicId: "M011",
        title: body.title,
        startsAt: body.startsAt,
        meetingType: "recurring",
        seriesPublicId: "S001",
        summary: body.summary,
        attendees: [avery],
        tasks: [tasks[1]],
        archived: false,
      };
      meetings.unshift(meeting);
      return json({ meeting }, 201);
    }

    if (url.pathname === "/api/meetings" && method === "GET") return json({ meetings });

    if (url.pathname === "/api/meetings" && method === "POST") {
      const meeting: MeetingDto = {
        publicId: "M100",
        title: body.title,
        startsAt: body.startsAt,
        meetingType: body.meetingType,
        seriesPublicId: body.seriesPublicId,
        summary: body.summary,
        attendees: [avery],
        tasks: [],
        archived: false,
      };
      meetings.push(meeting);
      return json({ meeting }, 201);
    }

    return json({});
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("dashboard and workspace flows", () => {
  it("shows dashboard detail and opens global search results", async () => {
    setupAppFetch();
    render(<App />);

    expect(await screen.findByText("T099")).toBeInTheDocument();
    expect(screen.getByText("Prep launch plan")).toBeInTheDocument();
    expect(screen.getByText("Leadership sync")).toBeInTheDocument();
    expect(screen.getByText("Use SQLite")).toBeInTheDocument();
    expect(screen.getByText("Project sync")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search"), "T099");
    expect(await screen.findByText("Exact ID match")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /T099 Prep launch plan/i }));

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
  });

  it("creates and edits standalone tasks and records decisions", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Tasks" }));
    await userEvent.type(await screen.findByLabelText("Task description"), "Draft rollout notes");
    await userEvent.selectOptions(screen.getByLabelText("Task assignee"), "P001");
    await userEvent.selectOptions(screen.getByLabelText("Task status"), "In Progress");
    await userEvent.type(screen.getByLabelText("Task due date"), "2026-06-18");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByText("Draft rollout notes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit T099" }));
    await userEvent.clear(screen.getByLabelText("Task description"));
    await userEvent.type(screen.getByLabelText("Task description"), "Prep launch materials");
    await userEvent.click(screen.getByRole("button", { name: "Update task" }));
    expect(await screen.findByText("Prep launch materials")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Decisions" }));
    await userEvent.type(await screen.findByLabelText("Decision"), "Adopt weekly review");
    await userEvent.type(screen.getByLabelText("Decision date"), "2026-06-10");
    await userEvent.type(screen.getByLabelText("Decision context"), "Recurring governance");
    await userEvent.click(screen.getByRole("button", { name: "Add decision" }));
    expect(await screen.findByText("Adopt weekly review")).toBeInTheDocument();
  });

  it("shows meetings and creates a recurring occurrence with carried tasks", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    expect(await screen.findByText("Leadership sync")).toBeInTheDocument();
    expect(screen.getByText("Carry roadmap")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Occurrence series"), "S001");
    await userEvent.type(screen.getByLabelText("Occurrence start"), "2026-06-16T09:00");
    await userEvent.type(screen.getByLabelText("Occurrence title"), "Project sync follow-up");
    await userEvent.click(screen.getByRole("button", { name: "Create occurrence" }));

    expect(await screen.findByText("Project sync follow-up")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Carry roadmap").length).toBeGreaterThan(1));
  });
});
