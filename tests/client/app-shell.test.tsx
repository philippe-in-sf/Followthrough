import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appSkinStorageKey } from "../../src/appSkins";
import { AppShell, type AppSection } from "../../src/components/AppShell";
import { getGuidedTourStorageKey } from "../../src/components/GuidedTour";
import type { User } from "../../src/api/types";

const user: User = {
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
  localStorage.clear();
});

function renderShell(
  section: AppSection = "Dashboard",
  options: {
    guidedTourCompleted?: boolean;
    workCalendarUrl?: string | null;
    user?: User;
  } = {},
) {
  const shellUser = options.user ?? user;
  if (options.guidedTourCompleted !== false) {
    localStorage.setItem(getGuidedTourStorageKey(shellUser.id), "true");
  }

  const onSectionChange = vi.fn();
  const onLogout = vi.fn();
  const onEnableNotifications = vi.fn();

  const result = render(
    <AppShell
      user={shellUser}
      section={section}
      onSectionChange={onSectionChange}
      onLogout={onLogout}
      onEnableNotifications={onEnableNotifications}
      notificationStatus="disabled"
      version="1.0.1"
      workCalendarUrl={options.workCalendarUrl}
    >
      <main>
        <h2>{section} content</h2>
      </main>
    </AppShell>,
  );

  return { onSectionChange, onLogout, onEnableNotifications, container: result.container };
}

async function openSkinSelector() {
  await userEvent.click(screen.getByRole("button", { name: /Choose app skin/ }));
  return screen.getByRole("radiogroup", { name: "App skin" });
}

describe("AppShell split context rail", () => {
  it("renders accessible icon navigation and selected-section context", () => {
    renderShell("Dashboard");
    const contextRail = screen.getByLabelText("Dashboard context");

    expect(screen.getByLabelText("Followthrough")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Tasks" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Choose app skin, Graphite selected" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      within(contextRail).getByText("Today's operational picture, task pressure, and recent activity."),
    ).toBeInTheDocument();
    expect(within(contextRail).getByText("Overdue")).toBeInTheDocument();
    expect(within(contextRail).getByText("Due soon")).toBeInTheDocument();
    expect(screen.getByLabelText("Version 1.0.1")).toBeInTheDocument();
  });

  it("offers four app skins from a compact picker", async () => {
    renderShell("Dashboard");

    expect(screen.queryByRole("radiogroup", { name: "App skin" })).not.toBeInTheDocument();

    const skinMenu = await openSkinSelector();

    expect(within(skinMenu).getByRole("radio", { name: "Graphite" })).toBeInTheDocument();
    expect(within(skinMenu).getByRole("radio", { name: "Harbor" })).toBeInTheDocument();
    expect(within(skinMenu).getByRole("radio", { name: "Cedar" })).toBeInTheDocument();
    expect(within(skinMenu).getByRole("radio", { name: "Cinder" })).toBeInTheDocument();
  });

  it("opens the guided tour for first-run users and remembers a skip", async () => {
    renderShell("Dashboard", { guidedTourCompleted: false });

    const dialog = await screen.findByRole("dialog", { name: "Guided tour" });
    expect(within(dialog).getByRole("heading", { name: "Primary navigation" })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Skip tour" }));

    expect(screen.queryByRole("dialog", { name: "Guided tour" })).not.toBeInTheDocument();
    expect(localStorage.getItem(getGuidedTourStorageKey(user.id))).toBe("true");
  });

  it("relaunches the guided tour from the topbar", async () => {
    renderShell("Dashboard");

    expect(screen.queryByRole("dialog", { name: "Guided tour" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start guided tour" }));

    expect(screen.getByRole("dialog", { name: "Guided tour" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Primary navigation" })).toBeInTheDocument();
  });

  it("switches sections for page-specific guided tour steps", async () => {
    const { onSectionChange } = renderShell("Dashboard");

    await userEvent.click(screen.getByRole("button", { name: "Start guided tour" }));
    const dialog = screen.getByRole("dialog", { name: "Guided tour" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));

    expect(onSectionChange).toHaveBeenCalledWith("Tasks");
  });

  it("changes and stores the selected app skin", async () => {
    renderShell("Dashboard");
    const shell = document.querySelector(".app-shell");

    expect(shell).toHaveAttribute("data-skin", "graphite");

    const skinMenu = await openSkinSelector();
    await userEvent.click(within(skinMenu).getByRole("radio", { name: "Harbor" }));

    expect(shell).toHaveAttribute("data-skin", "harbor");
    expect(localStorage.getItem(appSkinStorageKey)).toBe("harbor");
    expect(screen.queryByRole("radiogroup", { name: "App skin" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose app skin, Harbor selected" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("loads a stored app skin", async () => {
    localStorage.setItem(appSkinStorageKey, "cedar");

    renderShell("Dashboard");

    expect(document.querySelector(".app-shell")).toHaveAttribute("data-skin", "cedar");
    expect(within(await openSkinSelector()).getByRole("radio", { name: "Cedar" })).toBeChecked();
  });

  it("omits the calendar shortcut until it is configured", () => {
    renderShell("Dashboard", { workCalendarUrl: null });

    expect(screen.queryByRole("link", { name: "Open calendar shortcut" })).not.toBeInTheDocument();
  });

  it("renders the configured calendar shortcut", () => {
    renderShell("Dashboard", { workCalendarUrl: "https://calendar.example.com/team" });

    expect(screen.getByRole("link", { name: "Open calendar shortcut" })).toHaveAttribute(
      "href",
      "https://calendar.example.com/team",
    );
    expect(screen.getByRole("link", { name: "Open changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
  });

  it("shows admin navigation for admins", () => {
    renderShell("Dashboard");

    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });

  it("shows settings navigation without a topbar leave-team action", () => {
    renderShell("Dashboard");

    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave team" })).not.toBeInTheDocument();
  });

  it("hides admin navigation for members", () => {
    renderShell("Dashboard", {
      user: {
        ...user,
        role: "member",
      },
    });

    expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("renders team branding in the shell", () => {
    const { container } = renderShell("Dashboard", {
      user: {
        ...user,
        team: {
          id: 1,
          name: "Acme Ops",
          logoUrl: "https://example.com/logo.png",
          workCalendarUrl: "https://calendar.example.com/team",
        },
      },
      workCalendarUrl: "https://calendar.example.com/team",
    });

    expect(screen.getByText("Acme Ops")).toBeInTheDocument();
    expect(container.querySelector(".team-logo")).toHaveAttribute(
      "src",
      "https://example.com/logo.png",
    );
    expect(screen.getByRole("link", { name: "Open calendar shortcut" })).toHaveAttribute(
      "href",
      "https://calendar.example.com/team",
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
    expect(screen.getByRole("link", { name: "Open changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
    expect(screen.getByLabelText("Version 1.0.1")).toBeInTheDocument();
  });
});
