import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "../api/types";
import { GlobalSearch } from "./GlobalSearch";

const navItems = ["Dashboard", "Tasks", "Meetings", "Decisions", "People"] as const;

export type AppSection = (typeof navItems)[number];

export function AppShell({
  user,
  section,
  onSectionChange,
  onLogout,
  children,
}: {
  user: User;
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Task Manager</h1>
        <nav aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item}
              className={item === section ? "active" : ""}
              onClick={() => onSectionChange(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <GlobalSearch onOpenSection={onSectionChange} />
          <span className="user-name">{user.name}</span>
          <button className="icon-button" onClick={onLogout} aria-label="Sign out" type="button">
            <LogOut size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
