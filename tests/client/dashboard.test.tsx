import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AuditLogDto,
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
  const people: PersonDto[] = [avery];
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

  const taskAudits: Record<string, AuditLogDto[]> = {
    T099: [
      {
        id: 1,
        entityType: "task",
        entityPublicId: "T099",
        action: "created",
        summary: "Created task",
        actorName: "Editor",
        createdAt: "2026-06-09 12:00:00",
        changes: {},
      },
    ],
    T010: [
      {
        id: 2,
        entityType: "task",
        entityPublicId: "T010",
        action: "created",
        summary: "Created task",
        actorName: "Editor",
        createdAt: "2026-06-09 12:00:00",
        changes: {},
      },
    ],
  };

  const meetingAudits: Record<string, AuditLogDto[]> = {
    M010: [
      {
        id: 3,
        entityType: "meeting",
        entityPublicId: "M010",
        action: "created",
        summary: "Created meeting",
        actorName: "Editor",
        createdAt: "2026-06-09 12:00:00",
        changes: {},
      },
    ],
  };

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

    if (url.pathname === "/api/people" && method === "GET") return json({ people });

    if (url.pathname === "/api/people" && method === "POST") {
      const person: PersonDto = {
        publicId: `P${String(people.length + 1).padStart(3, "0")}`,
        name: body.name,
        email: body.email || null,
        archived: false,
      };
      people.push(person);
      return json({ person }, 201);
    }

    if (url.pathname === "/api/tasks" && method === "GET") return json({ tasks });

    const taskAuditMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/audit$/);
    if (taskAuditMatch && method === "GET") {
      return json({ auditEvents: taskAudits[taskAuditMatch[1]] ?? [] });
    }

    if (url.pathname === "/api/tasks" && method === "POST") {
      const task: TaskDto = {
        publicId: "T100",
        description: body.description,
        assignee: avery,
        status: body.status,
        dueDate: body.dueDate,
        originMeetingPublicId: body.originMeetingPublicId ?? null,
        seriesPublicId: body.seriesPublicId ?? null,
        alert: null,
        archived: false,
      };
      tasks.push(task);
      taskAudits[task.publicId] = [
        {
          id: 100,
          entityType: "task",
          entityPublicId: task.publicId,
          action: "created",
          summary: "Created task",
          actorName: "Editor",
          createdAt: "2026-06-09 12:10:00",
          changes: { after: task },
        },
      ];
      if (body.originMeetingPublicId) {
        const meeting = meetings.find((item) => item.publicId === body.originMeetingPublicId);
        meeting?.tasks.push(task);
        meetingAudits[body.originMeetingPublicId] = [
          {
            id: 101,
            entityType: "meeting",
            entityPublicId: body.originMeetingPublicId,
            action: "task_added",
            summary: `Added task ${task.publicId}`,
            actorName: "Editor",
            createdAt: "2026-06-09 12:10:00",
            changes: { task },
          },
          ...(meetingAudits[body.originMeetingPublicId] ?? []),
        ];
      }
      return json({ task }, 201);
    }

    if (url.pathname === "/api/tasks/T099" && method === "PATCH") {
      tasks[0] = { ...tasks[0], description: body.description, status: body.status };
      taskAudits.T099 = [
        {
          id: 102,
          entityType: "task",
          entityPublicId: "T099",
          action: "updated",
          summary: "Updated task details",
          actorName: "Editor",
          createdAt: "2026-06-09 12:15:00",
          changes: { after: tasks[0] },
        },
        ...taskAudits.T099,
      ];
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
        attendees: body.attendeePublicIds
          .map((publicId: string) => people.find((person) => person.publicId === publicId))
          .filter(Boolean) as PersonDto[],
        tasks: [tasks[1]],
        archived: false,
      };
      meetings.unshift(meeting);
      return json({ meeting }, 201);
    }

    if (url.pathname === "/api/meetings" && method === "GET") return json({ meetings });

    const meetingAuditMatch = url.pathname.match(/^\/api\/meetings\/([^/]+)\/audit$/);
    if (meetingAuditMatch && method === "GET") {
      return json({ auditEvents: meetingAudits[meetingAuditMatch[1]] ?? [] });
    }

    if (url.pathname === "/api/meetings" && method === "POST") {
      const meeting: MeetingDto = {
        publicId: "M100",
        title: body.title,
        startsAt: body.startsAt,
        meetingType: body.meetingType,
        seriesPublicId: body.seriesPublicId,
        summary: body.summary,
        attendees: body.attendeePublicIds
          .map((publicId: string) => people.find((person) => person.publicId === publicId))
          .filter(Boolean) as PersonDto[],
        tasks: [],
        archived: false,
      };
      meetings.push(meeting);
      meetingAudits[meeting.publicId] = [
        {
          id: 103,
          entityType: "meeting",
          entityPublicId: meeting.publicId,
          action: "created",
          summary: "Created meeting",
          actorName: "Editor",
          createdAt: "2026-06-09 12:20:00",
          changes: { after: meeting },
        },
      ];
      return json({ meeting }, 201);
    }

    if (url.pathname === "/api/meetings/M010" && method === "PATCH") {
      meetings[0] = {
        ...meetings[0],
        title: body.title,
        startsAt: body.startsAt,
        meetingType: body.meetingType,
        seriesPublicId: body.seriesPublicId,
        summary: body.summary,
        attendees: body.attendeePublicIds
          .map((publicId: string) => people.find((person) => person.publicId === publicId))
          .filter(Boolean) as PersonDto[],
        tasks: body.taskPublicIds
          .map((publicId: string) => tasks.find((task) => task.publicId === publicId))
          .filter(Boolean) as TaskDto[],
      };
      meetingAudits.M010 = [
        {
          id: 104,
          entityType: "meeting",
          entityPublicId: "M010",
          action: "updated",
          summary: "Updated meeting details",
          actorName: "Editor",
          createdAt: "2026-06-09 12:25:00",
          changes: { after: meetings[0] },
        },
        ...meetingAudits.M010,
      ];
      return json({ meeting: meetings[0] });
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

    const overdueTasks = await screen.findByRole("region", { name: "Overdue tasks" });
    expect(within(overdueTasks).getByText("Prep launch plan")).toBeInTheDocument();
    expect(within(overdueTasks).getByText("1 task")).toBeInTheDocument();

    const dueSoonTasks = screen.getByRole("region", { name: "Due soon tasks" });
    expect(within(dueSoonTasks).getByText("Carry roadmap")).toBeInTheDocument();

    const activeTasks = screen.getByRole("region", { name: "Active tasks" });
    expect(within(activeTasks).getByText("Draft rollout notes")).toBeInTheDocument();

    const taskCard = await screen.findByLabelText("Task T099");
    expect(within(taskCard).queryByText("Audit history")).not.toBeInTheDocument();
    expect(within(taskCard).queryByText("Created task")).not.toBeInTheDocument();

    await userEvent.click(within(taskCard).getByRole("button", { name: "Edit details for T099" }));
    expect(within(taskCard).getByRole("heading", { name: "Edit details for T099" })).toBeInTheDocument();
    expect(within(taskCard).getByText("Audit history")).toBeInTheDocument();
    expect(within(taskCard).getByText("Created task")).toBeInTheDocument();
    await userEvent.clear(within(taskCard).getByLabelText("Task description for T099"));
    await userEvent.type(
      within(taskCard).getByLabelText("Task description for T099"),
      "Prep launch materials",
    );
    await userEvent.click(within(taskCard).getByRole("button", { name: "Save task T099" }));
    expect(await screen.findByText("Prep launch materials")).toBeInTheDocument();

    const refreshedTaskCard = await screen.findByLabelText("Task T099");
    expect(within(refreshedTaskCard).queryByText("Updated task details")).not.toBeInTheDocument();
    await userEvent.click(
      within(refreshedTaskCard).getByRole("button", { name: "Edit details for T099" }),
    );
    expect(await within(refreshedTaskCard).findByText("Updated task details")).toBeInTheDocument();

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
    expect(
      within(screen.getByRole("region", { name: "Past meetings" })).getByText("Leadership sync"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Recurring series" })).getByText("Project sync"),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Occurrence series"), "S001");
    await userEvent.type(screen.getByLabelText("Occurrence start"), "2026-06-16T09:00");
    await userEvent.type(screen.getByLabelText("Occurrence title"), "Project sync follow-up");
    await userEvent.click(screen.getByRole("button", { name: "Create occurrence" }));

    expect(await screen.findByText("Project sync follow-up")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Upcoming meetings" })).getByText(
        "Project sync follow-up",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Carry roadmap").length).toBeGreaterThan(1));
  });

  it("creates tasks inside a meeting and edits meeting details", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    const meetingCard = await screen.findByLabelText("Meeting M010");
    expect(within(meetingCard).getByText("Audit history")).toBeInTheDocument();
    expect(within(meetingCard).getByText("Created meeting")).toBeInTheDocument();

    await userEvent.type(
      within(meetingCard).getByLabelText("New task description for M010"),
      "Capture action items",
    );
    await userEvent.selectOptions(
      within(meetingCard).getByLabelText("New task assignee for M010"),
      "P001",
    );
    await userEvent.selectOptions(
      within(meetingCard).getByLabelText("New task status for M010"),
      "In Progress",
    );
    await userEvent.type(within(meetingCard).getByLabelText("New task due date for M010"), "2026-06-20");
    await userEvent.click(within(meetingCard).getByRole("button", { name: "Add task to M010" }));

    expect(await screen.findByText("Capture action items")).toBeInTheDocument();
    expect(await screen.findByText("Added task T100")).toBeInTheDocument();

    const refreshedMeetingCard = await screen.findByLabelText("Meeting M010");
    await userEvent.click(
      within(refreshedMeetingCard).getByRole("button", { name: "Edit details for M010" }),
    );
    expect(
      within(refreshedMeetingCard).getByRole("heading", { name: "Edit details for M010" }),
    ).toBeInTheDocument();

    await userEvent.clear(within(refreshedMeetingCard).getByLabelText("Meeting title for M010"));
    await userEvent.type(
      within(refreshedMeetingCard).getByLabelText("Meeting title for M010"),
      "Updated leadership sync",
    );
    await userEvent.clear(within(refreshedMeetingCard).getByLabelText("Meeting summary for M010"));
    await userEvent.type(
      within(refreshedMeetingCard).getByLabelText("Meeting summary for M010"),
      "Updated summary",
    );
    await userEvent.type(
      within(refreshedMeetingCard).getByLabelText("New attendee names for M010"),
      "Morgan, Taylor",
    );
    await userEvent.click(
      within(refreshedMeetingCard).getByRole("button", { name: "Save meeting M010" }),
    );

    expect(await screen.findByText("Updated leadership sync")).toBeInTheDocument();
    expect(screen.getByText("Updated summary")).toBeInTheDocument();
    expect(screen.getByText("Avery, Morgan, Taylor")).toBeInTheDocument();
    expect(await screen.findByText("Updated meeting details")).toBeInTheDocument();
  });
});
