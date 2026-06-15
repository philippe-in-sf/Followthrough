import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "../api/types";
import { BrandMark } from "./BrandMark";
import { ContextRail } from "./ContextRail";
import { GlobalSearch } from "./GlobalSearch";
import { IconRail } from "./IconRail";
import { MobileSectionSummary } from "./MobileSectionSummary";
import type { AppSection } from "./shellNavigation";

export type { AppSection } from "./shellNavigation";

export function AppShell({
  user,
  section,
  onSectionChange,
  onLogout,
  version,
  children,
}: {
  user: User;
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  onLogout: () => void;
  version: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <IconRail section={section} onSectionChange={onSectionChange} version={version} />
      <ContextRail section={section} />
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-topbar-mark" aria-hidden="true">
            <BrandMark />
          </div>
          <GlobalSearch onOpenSection={onSectionChange} />
          <span className="user-name">{user.name}</span>
          <button className="icon-button sign-out-button" onClick={onLogout} aria-label="Sign out" type="button">
            <LogOut size={18} />
          </button>
        </header>
        <MobileSectionSummary section={section} />
        {children}
      </div>
    </div>
  );
}
