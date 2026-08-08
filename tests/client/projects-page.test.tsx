import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "../../src/features/projects/ProjectsPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("ProjectsPage", () => {
  it("shows project-centered notes with their source meeting", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/projects" && url.searchParams.get("archived") === "true") {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/api/projects") {
        return new Response(
          JSON.stringify({
            projects: [
              {
                publicId: "J001",
                name: "Website Relaunch",
                description: "Ship the site",
                status: "active",
                archived: false,
                meetingCount: 1,
                noteCount: 1,
                taskCount: 0,
                decisionCount: 0,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === "/api/projects/J001") {
        return new Response(
          JSON.stringify({
            project: {
              publicId: "J001",
              name: "Website Relaunch",
              description: "Ship the site",
              status: "active",
              archived: false,
              meetingCount: 1,
              noteCount: 1,
              taskCount: 0,
              decisionCount: 0,
              meetings: [
                {
                  publicId: "M001",
                  title: "Weekly operations",
                  startsAt: "2026-08-08T12:00:00.000Z",
                  timePrecision: "date",
                },
              ],
              notes: [
                {
                  publicId: "N001",
                  body: "Design approval expected Friday.",
                  noteType: "note",
                  sortOrder: 0,
                  projects: [{ publicId: "J001", name: "Website Relaunch", status: "active" }],
                  meeting: {
                    publicId: "M001",
                    title: "Weekly operations",
                    startsAt: "2026-08-08T12:00:00.000Z",
                    timePrecision: "date",
                  },
                  createdAt: "2026-08-08T12:00:00.000Z",
                  updatedAt: "2026-08-08T12:00:00.000Z",
                },
              ],
              tasks: [],
              decisions: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const onOpenMeeting = vi.fn();

    render(<ProjectsPage onOpenMeeting={onOpenMeeting} />);

    expect(await screen.findByText("Design approval expected Friday.")).toBeInTheDocument();
    expect(screen.getByText("Ship the site")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: /Weekly operations/i })[0]);
    expect(onOpenMeeting).toHaveBeenCalledWith("M001");
  });
});
