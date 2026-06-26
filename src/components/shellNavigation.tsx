import {
  BadgeCheck,
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export const navItems = ["Dashboard", "Tasks", "Meetings", "Decisions", "People", "Admin"] as const;

export type AppSection = (typeof navItems)[number];

export type ContextRow = {
  label: string;
  value?: string;
};

export type SectionNavigation = {
  icon: LucideIcon;
  description: string;
  contextRows: ContextRow[];
};

export const sectionNavigation: Record<AppSection, SectionNavigation> = {
  Dashboard: {
    icon: LayoutDashboard,
    description: "Today's operational picture, task pressure, and recent activity.",
    contextRows: [
      { label: "Overdue" },
      { label: "Due soon" },
      { label: "Open by person" },
      { label: "Recent meetings" },
    ],
  },
  Tasks: {
    icon: ListTodo,
    description: "Track open work, owners, due dates, and blocked items.",
    contextRows: [{ label: "Overdue" }, { label: "Due soon" }, { label: "Active" }, { label: "Done" }],
  },
  Meetings: {
    icon: CalendarDays,
    description: "Capture meetings, attendees, linked tasks, and recurring series.",
    contextRows: [{ label: "Recent meetings" }, { label: "Recurring series" }, { label: "Meetings with open tasks" }],
  },
  Decisions: {
    icon: BadgeCheck,
    description: "Find recorded decisions and the meeting context behind them.",
    contextRows: [{ label: "Recent decisions" }, { label: "Linked to meetings" }],
  },
  People: {
    icon: Users,
    description: "Shared list of assignees and meeting attendees.",
    contextRows: [{ label: "Total people" }, { label: "People with open tasks" }, { label: "People in recent meetings" }],
  },
  Admin: {
    icon: Settings,
    description: "Manage team settings, shared shortcuts, and user roles.",
    contextRows: [{ label: "Team settings" }, { label: "Users" }, { label: "Roles" }],
  },
};

export const sectionOrder = navItems.map((section) => ({
  section,
  ...sectionNavigation[section],
}));

export function visibleSectionOrder(isAdmin: boolean) {
  return sectionOrder.filter((item) => item.section !== "Admin" || isAdmin);
}
