import { render, screen } from "@testing-library/react";
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

    expect(screen.getByLabelText("Task Manager")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Tasks" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Today's operational picture, task pressure, and recent activity.")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Due soon")).toBeInTheDocument();
    expect(screen.getByText("Version 1.0.1")).toBeInTheDocument();
  });

  it("switches sections from the icon rail", async () => {
    const { onSectionChange } = renderShell("Dashboard");

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));

    expect(onSectionChange).toHaveBeenCalledWith("Tasks");
  });

  it("renders context for the active section", () => {
    renderShell("Tasks");

    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Track open work, owners, due dates, and blocked items.")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
