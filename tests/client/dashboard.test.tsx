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

const deckUrl = "https://docs.google.com/presentation/d/example/edit#slide=id.g36488bc6fbc_0_3";

function json(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

async function expandMeetingCard(publicId: string) {
  const meetingCard = await screen.findByLabelText(`Meeting ${publicId}`);
  await userEvent.click(
    within(meetingCard).getByRole("button", { name: new RegExp(`Expand meeting ${publicId}`) }),
  );
  return meetingCard;
}

async function expandTaskCard(publicId: string) {
  const taskCard = await screen.findByLabelText(`Task ${publicId}`);
  await userEvent.click(
    within(taskCard).getByRole("button", { name: new RegExp(`Expand task ${publicId}`) }),
  );
  return taskCard;
}

function setupAppFetch(
  options: {
    workCalendarUrl?: string | null;
    googleCalendarConfigured?: boolean;
    googleCalendarConnected?: boolean;
    googleCalendarEmail?: string | null;
  } = {},
) {
  const people: PersonDto[] = [avery];
  let workCalendarUrl = options.workCalendarUrl ?? null;
  let googleCalendarConnected = options.googleCalendarConnected ?? false;
  let googleCalendarEmail = options.googleCalendarEmail ?? null;
  const googleCalendarConfigured = options.googleCalendarConfigured ?? true;
  const tasks: TaskDto[] = [
    {
      publicId: "T099",
      description: "Prep launch plan",
      blockers: "Waiting on finance numbers",
      notes: "Finance owner pinged; waiting on workbook.",
      blockersClearedAt: null,
      assignee: avery,
      status: "Open",
      dueDate: "2026-06-08",
      originMeetingPublicId: null,
      seriesPublicId: null,
      reminderMode: "automatic",
      lastReminderSentAt: null,
      alert: "overdue",
      private: false,
      archived: false,
    },
    {
      publicId: "T010",
      description: "Carry roadmap",
      blockers: "Legal review is slow",
      notes: "Roadmap handoff is drafted.",
      blockersClearedAt: "2026-06-09T13:00:00.000Z",
      assignee: avery,
      status: "In Progress",
      dueDate: "2026-06-15",
      originMeetingPublicId: "M010",
      seriesPublicId: "S001",
      reminderMode: "automatic",
      lastReminderSentAt: null,
      alert: "dueSoon",
      private: false,
      archived: false,
    },
    {
      publicId: "T004",
      description: `Do the All Hands deck (${deckUrl})`,
      blockers: "",
      notes: "",
      blockersClearedAt: null,
      assignee: avery,
      status: "Open",
      dueDate: "2026-06-17",
      originMeetingPublicId: null,
      seriesPublicId: null,
      reminderMode: "automatic",
      lastReminderSentAt: null,
      alert: null,
      private: false,
      archived: false,
    },
  ];
  const archivedTasks: TaskDto[] = [];

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
      blockers: "Need agenda owner",
      blockersClearedAt: null,
      notes: "Previous launch notes",
      links: [
        {
          id: 1,
          label: "Launch agenda",
          url: "https://example.com/agenda",
          linkType: "agenda",
        },
      ],
      attendees: [avery],
      tasks: [tasks[1]],
      private: false,
      archived: false,
    },
  ];
  const archivedMeetings: MeetingDto[] = [];

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
      return json({
        user: {
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
        },
      });
    }

    if (url.pathname === "/api/me/preferences" && method === "GET") {
      return json({
        workCalendarUrl,
        googleCalendarConfigured,
        googleCalendarConnected,
        googleCalendarEmail,
      });
    }

    if (url.pathname === "/api/me/preferences" && method === "PUT") {
      const nextUrl = body.workCalendarUrl === null ? null : String(body.workCalendarUrl).trim();
      if (nextUrl) {
        try {
          const parsed = new URL(nextUrl);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return json({ error: "Enter a valid http or https calendar URL." }, 400);
          }
        } catch {
          return json({ error: "Enter a valid http or https calendar URL." }, 400);
        }
      }
      workCalendarUrl = nextUrl || null;
      return json({
        workCalendarUrl,
        googleCalendarConfigured,
        googleCalendarConnected,
        googleCalendarEmail,
      });
    }

    if (url.pathname === "/api/google-calendar/connection" && method === "DELETE") {
      googleCalendarConnected = false;
      googleCalendarEmail = null;
      return json(null, 204);
    }

    if (url.pathname === "/api/dashboard") {
      return json({
        alerts: {
          overdue: tasks.filter((task) => task.alert === "overdue"),
          dueSoon: tasks.filter((task) => task.alert === "dueSoon"),
        },
        openTasksByAssignee: [{ assignee: avery, tasks }],
        activeBlockers: {
          tasks: tasks.filter((task) => task.blockers && !task.blockersClearedAt),
          meetings: meetings
            .filter((meeting) => meeting.blockers && !meeting.blockersClearedAt)
            .map((meeting) => ({
              publicId: meeting.publicId,
              title: meeting.title,
              startsAt: meeting.startsAt,
              blockers: meeting.blockers,
              blockersClearedAt: meeting.blockersClearedAt,
            })),
        },
        recentMeetings: meetings.map((meeting) => ({
          publicId: meeting.publicId,
          title: meeting.title,
          startsAt: meeting.startsAt,
          blockers: meeting.blockers,
          blockersClearedAt: meeting.blockersClearedAt,
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
            publicId: "T009",
            title: `Prep launch plan (${deckUrl})`,
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

    if (url.pathname === "/api/tasks" && method === "GET") {
      return json({
        tasks: url.searchParams.get("archived") === "true" ? archivedTasks : tasks,
      });
    }

    const taskAuditMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/audit$/);
    if (taskAuditMatch && method === "GET") {
      return json({ auditEvents: taskAudits[taskAuditMatch[1]] ?? [] });
    }

    if (url.pathname === "/api/tasks" && method === "POST") {
      const task: TaskDto = {
        publicId: "T100",
        description: body.description,
        blockers: body.blockers ?? "",
        notes: body.notes ?? "",
        blockersClearedAt: body.blockersCleared && body.blockers ? "2026-06-09T12:10:00.000Z" : null,
        assignee: avery,
        status: body.status,
        dueDate: body.dueDate,
        originMeetingPublicId: body.originMeetingPublicId ?? null,
        seriesPublicId: body.seriesPublicId ?? null,
        reminderMode: body.reminderMode ?? "automatic",
        lastReminderSentAt: null,
        alert: null,
        private: body.private ?? false,
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
      tasks[0] = {
        ...tasks[0],
        description: body.description,
        blockers: body.blockers ?? tasks[0].blockers,
        notes: body.notes ?? tasks[0].notes,
        blockersClearedAt:
          body.blockersCleared === undefined
            ? tasks[0].blockersClearedAt
            : body.blockersCleared && (body.blockers ?? tasks[0].blockers)
              ? "2026-06-09T12:15:00.000Z"
              : null,
        status: body.status,
        reminderMode: body.reminderMode ?? tasks[0].reminderMode,
      };
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

    if (url.pathname === "/api/tasks/T099/archive" && method === "POST") {
      const index = tasks.findIndex((task) => task.publicId === "T099");
      if (index >= 0) {
        const [task] = tasks.splice(index, 1);
        archivedTasks.unshift({ ...task, archived: true });
      }
      return json(null, 204);
    }

    if (url.pathname === "/api/tasks/T099/restore" && method === "POST") {
      const index = archivedTasks.findIndex((task) => task.publicId === "T099");
      if (index < 0) return json({});
      const [task] = archivedTasks.splice(index, 1);
      const restored = { ...task, archived: false };
      tasks.unshift(restored);
      return json({ task: restored });
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
        blockers: body.blockers ?? "",
        blockersClearedAt: body.blockersCleared && body.blockers ? "2026-06-09T12:18:00.000Z" : null,
        notes: body.notes ?? meetings[0]?.notes ?? "",
        links: body.links ?? meetings[0]?.links ?? [],
        attendees: body.attendeePublicIds
          .map((publicId: string) => people.find((person) => person.publicId === publicId))
          .filter(Boolean) as PersonDto[],
        tasks: [tasks[1]],
        private: body.private ?? false,
        archived: false,
      };
      meetings.unshift(meeting);
      return json({ meeting }, 201);
    }

    if (url.pathname === "/api/meetings" && method === "GET") {
      return json({
        meetings: url.searchParams.get("archived") === "true" ? archivedMeetings : meetings,
      });
    }

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
        blockers: body.blockers ?? "",
        blockersClearedAt: body.blockersCleared && body.blockers ? "2026-06-09T12:20:00.000Z" : null,
        notes: body.notes ?? "",
        links: body.links ?? [],
        attendees: body.attendeePublicIds
          .map((publicId: string) => people.find((person) => person.publicId === publicId))
          .filter(Boolean) as PersonDto[],
        tasks: [],
        private: body.private ?? false,
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
        blockers: body.blockers ?? meetings[0].blockers,
        blockersClearedAt:
          body.blockersCleared === undefined
            ? meetings[0].blockersClearedAt
            : body.blockersCleared && (body.blockers ?? meetings[0].blockers)
              ? "2026-06-09T12:25:00.000Z"
              : null,
        notes: body.notes ?? meetings[0].notes,
        links: body.links ?? meetings[0].links,
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

    if (url.pathname === "/api/meetings/M010/archive" && method === "POST") {
      const index = meetings.findIndex((meeting) => meeting.publicId === "M010");
      if (index >= 0) {
        const [meeting] = meetings.splice(index, 1);
        archivedMeetings.unshift({ ...meeting, archived: true });
      }
      return json(null, 204);
    }

    if (url.pathname === "/api/meetings/M010/restore" && method === "POST") {
      const index = archivedMeetings.findIndex((meeting) => meeting.publicId === "M010");
      if (index < 0) return json({});
      const [meeting] = archivedMeetings.splice(index, 1);
      const restored = { ...meeting, archived: false };
      meetings.unshift(restored);
      return json({ meeting: restored });
    }

    return json({});
  }) as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("dashboard and workspace flows", () => {
  it("loads the saved calendar shortcut", async () => {
    setupAppFetch({ workCalendarUrl: "https://calendar.example.com/team" });
    render(<App />);

    expect(await screen.findByRole("link", { name: "Open calendar shortcut" })).toHaveAttribute(
      "href",
      "https://calendar.example.com/team",
    );
  });

  it("shows Google Calendar connect as the primary path with URL paste as a secondary option", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    expect(screen.queryByRole("link", { name: "Open calendar shortcut" })).not.toBeInTheDocument();
    expect(await screen.findByText("Google Calendar is not connected.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute(
      "href",
      "/api/google-calendar/connect",
    );
    expect(screen.getByLabelText("Calendar shortcut URL")).toBeInTheDocument();
  });

  it("saves and clears the secondary calendar shortcut URL from Meetings", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    await userEvent.type(
      await screen.findByLabelText("Calendar shortcut URL"),
      "https://calendar.example.com/team",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save shortcut" }));

    expect(await screen.findByText("Calendar shortcut saved.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open calendar shortcut" })).toHaveAttribute(
      "href",
      "https://calendar.example.com/team",
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear shortcut" }));

    expect(await screen.findByText("Calendar shortcut cleared.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Open calendar shortcut" })).not.toBeInTheDocument();
    });
  });

  it("shows a secondary shortcut validation error without changing the rail", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    await userEvent.type(await screen.findByLabelText("Calendar shortcut URL"), "javascript:alert(1)");
    await userEvent.click(screen.getByRole("button", { name: "Save shortcut" }));

    expect(
      await screen.findByText("Enter a valid http or https calendar URL."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open calendar shortcut" })).not.toBeInTheDocument();
  });

  it("disconnects a connected Google Calendar account from Meetings", async () => {
    setupAppFetch({
      googleCalendarConnected: true,
      googleCalendarEmail: "editor@gmail.com",
    });
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    expect(await screen.findByText("Connected as editor@gmail.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Disconnect Google Calendar" }));

    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/google-calendar/connection" && init?.method === "DELETE",
        ),
    ).toBe(true);
    expect(await screen.findByText("Google Calendar disconnected.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Google Calendar" })).toHaveAttribute(
      "href",
      "/api/google-calendar/connect",
    );
  });

  it("shows dashboard detail and opens global search results", async () => {
    setupAppFetch();
    render(<App />);

    expect((await screen.findAllByText("T099")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Prep launch plan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Waiting on finance numbers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Need agenda owner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Leadership sync").length).toBeGreaterThan(0);
    expect(screen.getByText("Use SQLite")).toBeInTheDocument();
    expect(screen.getByText("Project sync")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search"), "T099");
    const searchResults = await screen.findByRole("listbox", { name: "Search results" });
    expect(searchResults).toHaveTextContent("Prep launch plan (Link)");
    expect(searchResults).not.toHaveTextContent("https://docs.google.com");
    expect(await screen.findByText("Exact ID match")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /T009 Prep launch plan \(Link\)/i }));

    await waitFor(() => {
      expect(within(screen.getByRole("main")).getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    });
  });

  it("opens dashboard tasks, meetings, and decisions in their detail views", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click((await screen.findAllByRole("button", { name: "Open task T099" }))[0]);

    await waitFor(() => {
      expect(within(screen.getByRole("main")).getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    });
    const taskCard = await screen.findByLabelText("Task T099");
    expect(within(taskCard).getByRole("heading", { name: "Edit details for T099" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /Open meeting M010 Leadership sync/i }))[0],
    );

    await waitFor(() => {
      expect(within(screen.getByRole("main")).getByRole("heading", { name: "Meetings" })).toBeInTheDocument();
    });
    const meetingCard = await screen.findByLabelText("Meeting M010");
    expect(within(meetingCard).getByRole("heading", { name: "Edit details for M010" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Open decision D001 Use SQLite/i }),
    );

    await waitFor(() => {
      expect(within(screen.getByRole("main")).getByRole("heading", { name: "Decisions" })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Decision")).toHaveValue("Use SQLite");
    expect(screen.getByRole("button", { name: "Update decision" })).toBeInTheDocument();
  });

  it("collapses task description urls in collapsed task cards", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Tasks" }));

    const taskCard = await screen.findByLabelText("Task T004");
    const summaryButton = within(taskCard).getByRole("button", {
      name: /Expand task T004 Do the All Hands deck \(Link\)/i,
    });

    expect(summaryButton).toHaveTextContent("Do the All Hands deck (Link)");
    expect(summaryButton).not.toHaveTextContent("https://docs.google.com");
  });

  it("creates and edits standalone tasks and records decisions", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Tasks" }));
    expect(screen.queryByLabelText("Reminder mode")).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Task description"), "Draft rollout notes");
    await userEvent.type(screen.getByLabelText("Task notes"), "Initial rollout draft saved.");
    await userEvent.selectOptions(screen.getByLabelText("Task assignee"), "P001");
    await userEvent.selectOptions(screen.getByLabelText("Task status"), "In Progress");
    await userEvent.type(screen.getByLabelText("Task due date"), "2026-06-18");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    const taskCreateCall = [...vi.mocked(globalThis.fetch).mock.calls]
      .reverse()
      .find(([input, init]) => String(input).endsWith("/api/tasks") && init?.method === "POST");
    expect(JSON.parse(String(taskCreateCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        blockers: "",
        blockersCleared: false,
        notes: "Initial rollout draft saved.",
        reminderMode: "manual",
      }),
    );
    expect(await screen.findByText("Draft rollout notes")).toBeInTheDocument();
    const newTaskCard = await expandTaskCard("T100");
    expect(await within(newTaskCard).findByText("Initial rollout draft saved.")).toBeInTheDocument();

    const blockedTasks = await screen.findByRole("region", { name: "Tasks with blockers" });
    expect(within(blockedTasks).getByText("Prep launch plan")).toBeInTheDocument();
    expect(within(blockedTasks).getByText("1 task")).toBeInTheDocument();

    const dueSoonTasks = screen.getByRole("region", { name: "Due soon tasks" });
    expect(within(dueSoonTasks).getByText("Carry roadmap")).toBeInTheDocument();

    const activeTasks = screen.getByRole("region", { name: "Active tasks" });
    expect(within(activeTasks).getByText("Draft rollout notes")).toBeInTheDocument();

    const taskCard = await screen.findByLabelText("Task T099");
    expect(within(taskCard).queryByText("Audit history")).not.toBeInTheDocument();
    expect(within(taskCard).queryByText("Created task")).not.toBeInTheDocument();
    await userEvent.click(within(taskCard).getByRole("button", { name: /Expand task T099/i }));
    expect(await within(taskCard).findByText("Waiting on finance numbers")).toBeInTheDocument();

    await userEvent.click(within(taskCard).getByRole("button", { name: "Edit details for T099" }));
    expect(within(taskCard).getByRole("heading", { name: "Edit details for T099" })).toBeInTheDocument();
    expect(within(taskCard).queryByLabelText("Reminder mode for T099")).not.toBeInTheDocument();
    expect(within(taskCard).getByLabelText("Task blockers for T099")).toHaveValue(
      "Waiting on finance numbers",
    );
    expect(within(taskCard).getByLabelText("Task notes for T099")).toHaveValue(
      "Finance owner pinged; waiting on workbook.",
    );
    expect(within(taskCard).getByText("Audit history")).toBeInTheDocument();
    expect(within(taskCard).getByText("Created task")).toBeInTheDocument();
    await userEvent.clear(within(taskCard).getByLabelText("Task description for T099"));
    await userEvent.type(
      within(taskCard).getByLabelText("Task description for T099"),
      "Prep launch materials",
    );
    await userEvent.clear(within(taskCard).getByLabelText("Task notes for T099"));
    await userEvent.type(
      within(taskCard).getByLabelText("Task notes for T099"),
      "Finance sent workbook; prepping launch materials.",
    );
    await userEvent.click(within(taskCard).getByLabelText("Blocker cleared"));
    await userEvent.click(within(taskCard).getByRole("button", { name: "Save task T099" }));
    expect(await screen.findByText("Prep launch materials")).toBeInTheDocument();
    const taskUpdateCall = [...vi.mocked(globalThis.fetch).mock.calls]
      .reverse()
      .find(([input, init]) => String(input) === "/api/tasks/T099" && init?.method === "PATCH");
    expect(JSON.parse(String(taskUpdateCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        blockers: "Waiting on finance numbers",
        blockersCleared: true,
        notes: "Finance sent workbook; prepping launch materials.",
      }),
    );

    const refreshedTaskCard = await screen.findByLabelText("Task T099");
    expect(within(refreshedTaskCard).getAllByText("Blocker cleared").length).toBeGreaterThan(0);
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

  it("archives and restores tasks and meetings from detail views only", async () => {
    setupAppFetch();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Tasks" }));
    const taskCard = await screen.findByLabelText("Task T099");
    expect(
      within(taskCard).queryByRole("button", { name: "Archive task T099" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(taskCard).getByRole("button", { name: /Expand task T099/i }));
    expect(
      within(taskCard).queryByRole("button", { name: "Archive task T099" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(taskCard).getByRole("button", { name: "Edit details for T099" }));
    await userEvent.click(within(taskCard).getByRole("button", { name: "Archive task T099" }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Archive task T099"));
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/tasks/T099/archive" && init?.method === "POST",
        ),
    ).toBe(true);
    await waitFor(() => {
      expect(screen.queryByLabelText("Task T099")).not.toBeInTheDocument();
    });

    await userEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Archived" }));
    const archivedTaskCard = await expandTaskCard("T099");
    expect(within(archivedTaskCard).getAllByText("Archived").length).toBeGreaterThan(0);
    expect(
      within(archivedTaskCard).queryByRole("button", { name: "Archive task T099" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(archivedTaskCard).getByRole("button", { name: "Restore task T099" }),
    );
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/tasks/T099/restore" && init?.method === "POST",
        ),
    ).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Meetings" }));
    const meetingCard = await screen.findByLabelText("Meeting M010");
    expect(
      within(meetingCard).queryByRole("button", { name: "Archive meeting M010" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(meetingCard).getByRole("button", { name: /Expand meeting M010/i }),
    );
    expect(
      within(meetingCard).queryByRole("button", { name: "Archive meeting M010" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(meetingCard).getByRole("button", { name: "Edit details for M010" }),
    );
    await userEvent.click(
      within(meetingCard).getByRole("button", { name: "Archive meeting M010" }),
    );
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Archive meeting M010"));
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/meetings/M010/archive" && init?.method === "POST",
        ),
    ).toBe(true);
    await waitFor(() => {
      expect(screen.queryByLabelText("Meeting M010")).not.toBeInTheDocument();
    });

    await userEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Archived" }));
    const archivedMeetingCard = await expandMeetingCard("M010");
    expect(within(archivedMeetingCard).getAllByText("Archived").length).toBeGreaterThan(0);
    expect(
      within(archivedMeetingCard).queryByRole("button", { name: "Archive meeting M010" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(archivedMeetingCard).getByRole("button", { name: "Restore meeting M010" }),
    );
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/meetings/M010/restore" && init?.method === "POST",
        ),
    ).toBe(true);
  });

  it("shows meetings and creates a recurring occurrence with carried tasks", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    expect(await screen.findByText("Leadership sync")).toBeInTheDocument();
    const meetingCard = await screen.findByLabelText("Meeting M010");
    expect(within(meetingCard).queryByText("Need agenda owner")).not.toBeInTheDocument();
    await userEvent.click(
      within(meetingCard).getByRole("button", { name: /Expand meeting M010/i }),
    );
    expect(await within(meetingCard).findByText("Need agenda owner")).toBeInTheDocument();
    expect(within(meetingCard).getByText("Carry roadmap")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Meetings with blockers" })).getByText(
        "Leadership sync",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Recurring series" })).getByText("Project sync"),
    ).toBeInTheDocument();
    const meetingTaskOptions = screen.getByRole("group", { name: "Meeting tasks" });
    expect(meetingTaskOptions).toHaveTextContent("T004 Do the All Hands deck (Link)");
    expect(meetingTaskOptions).not.toHaveTextContent("https://docs.google.com");
    expect(within(meetingTaskOptions).getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      deckUrl,
    );

    const futureOccurrenceDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await userEvent.selectOptions(screen.getByLabelText("Occurrence series"), "S001");
    await userEvent.type(screen.getByLabelText("Occurrence start"), "2099-06-16T09:00");
    await userEvent.type(screen.getByLabelText("Occurrence title"), "Project sync follow-up");
    await userEvent.click(screen.getByRole("button", { name: "Create occurrence" }));

    expect(await screen.findByText("Project sync follow-up")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Upcoming meetings" })).getByText(
        "Project sync follow-up",
      ),
    ).toBeInTheDocument();
    const nextOccurrenceCard = await expandMeetingCard("M011");
    expect(within(nextOccurrenceCard).getByText("Carry roadmap")).toBeInTheDocument();
  });

  it("edits meeting notes and structured links", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    const meetingCard = await expandMeetingCard("M010");
    await userEvent.click(
      within(meetingCard).getByRole("button", { name: "Open notes for M010" }),
    );

    const notesField = await screen.findByLabelText("Notes for M010");
    const blockersField = screen.getByLabelText("Blockers for M010");
    expect(blockersField).toHaveValue("Need agenda owner");
    expect(notesField).toHaveValue("Previous launch notes");
    expect(screen.getByDisplayValue("Launch agenda")).toBeInTheDocument();

    await userEvent.clear(notesField);
    await userEvent.type(notesField, "Live launch notes");
    await userEvent.click(screen.getByLabelText("Blocker cleared"));
    await userEvent.type(screen.getByLabelText("New link label"), "Customer deck");
    await userEvent.type(screen.getByLabelText("New link URL"), "https://example.com/deck");
    await userEvent.selectOptions(screen.getByLabelText("New link type"), "work");
    await userEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(await screen.findByDisplayValue("Customer deck")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save notes" }));

    const patchCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(
        ([input, init]) => String(input) === "/api/meetings/M010" && init?.method === "PATCH",
      );
    const body = JSON.parse(String(patchCall?.[1]?.body));

    expect(body.blockers).toBe("Need agenda owner");
    expect(body.blockersCleared).toBe(true);
    expect(body.notes).toBe("Live launch notes");
    expect(body.links).toEqual([
      {
        label: "Launch agenda",
        url: "https://example.com/agenda",
        linkType: "agenda",
      },
      {
        label: "Customer deck",
        url: "https://example.com/deck",
        linkType: "work",
      },
    ]);
  });

  it("creates tasks inside a meeting and edits meeting details", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    const meetingCard = await expandMeetingCard("M010");
    expect(within(meetingCard).getByText("Audit history")).toBeInTheDocument();
    expect(within(meetingCard).getByText("Created meeting")).toBeInTheDocument();

    await userEvent.type(
      within(meetingCard).getByLabelText("New task description for M010"),
      "Capture action items",
    );
    await userEvent.type(
      within(meetingCard).getByLabelText("New task blockers for M010"),
      "Need customer list",
    );
    await userEvent.type(
      within(meetingCard).getByLabelText("New task notes for M010"),
      "Customer list request sent.",
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
    const meetingTaskCreateCall = [...vi.mocked(globalThis.fetch).mock.calls]
      .reverse()
      .find(([input, init]) => String(input).endsWith("/api/tasks") && init?.method === "POST");
    expect(JSON.parse(String(meetingTaskCreateCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        blockers: "Need customer list",
        blockersCleared: false,
        notes: "Customer list request sent.",
      }),
    );

    expect(await screen.findByText("Capture action items")).toBeInTheDocument();
    expect(await screen.findByText("Need customer list")).toBeInTheDocument();
    expect(await screen.findByText("Customer list request sent.")).toBeInTheDocument();
    expect(await screen.findByText("Added task T100")).toBeInTheDocument();

    const refreshedMeetingCard = await screen.findByLabelText("Meeting M010");
    await userEvent.click(
      within(refreshedMeetingCard).getByRole("button", { name: "Edit details for M010" }),
    );
    expect(
      within(refreshedMeetingCard).getByRole("heading", { name: "Edit details for M010" }),
    ).toBeInTheDocument();
    const meetingEditTaskOptions = within(refreshedMeetingCard).getByRole("group", {
      name: "Meeting tasks for M010",
    });
    expect(meetingEditTaskOptions).toHaveTextContent("T004 Do the All Hands deck (Link)");
    expect(meetingEditTaskOptions).not.toHaveTextContent("https://docs.google.com");
    expect(within(meetingEditTaskOptions).getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      deckUrl,
    );

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
    expect(screen.getAllByText("Updated summary").length).toBeGreaterThan(0);
    expect(screen.getByText("Avery, Morgan, Taylor")).toBeInTheDocument();
    expect(await screen.findByText("Updated meeting details")).toBeInTheDocument();
  });
});
