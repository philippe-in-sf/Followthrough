import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell, type AppSection } from "../../src/components/AppShell";

const user = { id: 1, name: "Editor", email: "editor@example.com" };

function renderShell(section: AppSection = "Dashboard") {
  const onSectionChange = vi.fn();
  const onLogout = vi.fn();

  render(
    <AppShell
      user={user}
      section={section}
      onSectionChange={onSectionChange}
      onLogout={onLogout}
      version="1.0.1"
    >
      <main>
        <h2>{section} content</h2>
      </main>
    </AppShell>,
  );

  return { onSectionChange, onLogout };
}

describe("AppShell split context rail", () => {
  it("renders accessible icon navigation and selected-section context", () => {
    renderShell("Dashboard");
    const contextRail = screen.getByLabelText("Dashboard context");

    expect(screen.getByLabelText("Followthrough")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Tasks" })).not.toHaveAttribute("aria-current");
    expect(
      within(contextRail).getByText("Today's operational picture, task pressure, and recent activity."),
    ).toBeInTheDocument();
    expect(within(contextRail).getByText("Overdue")).toBeInTheDocument();
    expect(within(contextRail).getByText("Due soon")).toBeInTheDocument();
    expect(screen.getByLabelText("Version 1.0.1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open work calendar" })).toHaveAttribute(
      "href",
      "https://calendar.google.com",
    );
    expect(screen.getByRole("link", { name: "Open changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
  });

  it("switches sections from the icon rail", async () => {
    const { onSectionChange } = renderShell("Dashboard");

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));

    expect(onSectionChange).toHaveBeenCalledWith("Tasks");
  });

  it("renders context for the active section", () => {
    renderShell("Tasks");
    const contextRail = screen.getByLabelText("Tasks context");

    expect(within(contextRail).getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(
      within(contextRail).getByText("Track open work, owners, due dates, and blocked items."),
    ).toBeInTheDocument();
    expect(within(contextRail).getByText("Active")).toBeInTheDocument();
    expect(within(contextRail).getByText("Done")).toBeInTheDocument();
  });

  it("renders a mobile section summary from the active section metadata", () => {
    renderShell("Meetings");

    const mobileSummary = screen.getByRole("region", { name: "Mobile section summary" });

    expect(within(mobileSummary).getByText("Current section")).toBeInTheDocument();
    expect(within(mobileSummary).getByRole("heading", { name: "Meetings" })).toBeInTheDocument();
    expect(
      within(mobileSummary).getByText("Capture meetings, attendees, linked tasks, and recurring series."),
    ).toBeInTheDocument();
    expect(within(mobileSummary).getByText("Recent meetings")).toBeInTheDocument();
    expect(within(mobileSummary).getByText("Recurring series")).toBeInTheDocument();
  });

  it("keeps mobile command bar actions available", () => {
    renderShell("Dashboard");

    const primarySections = screen.getByRole("navigation", { name: "Primary sections" });

    expect(within(primarySections).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(primarySections).getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open work calendar" })).toHaveAttribute(
      "href",
      "https://calendar.google.com",
    );
    expect(screen.getByRole("link", { name: "Open changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
    expect(screen.getByLabelText("Version 1.0.1")).toBeInTheDocument();
  });
});
