import { LogOut } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "../api/types";
import { readStoredAppSkin, storeAppSkin } from "../appSkins";
import { loadClientConfig } from "../clientConfig";
import { BrandMark } from "./BrandMark";
import { ContextRail } from "./ContextRail";
import { GlobalSearch } from "./GlobalSearch";
import { IconRail } from "./IconRail";
import { MobileSectionSummary } from "./MobileSectionSummary";
import { SkinSelector } from "./SkinSelector";
import type { AppSection } from "./shellNavigation";

export type { AppSection } from "./shellNavigation";

export function AppShell({
  user,
  section,
  onSectionChange,
  onLogout,
  version,
  workCalendarUrl = loadClientConfig().workCalendarUrl,
  children,
}: {
  user: User;
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  onLogout: () => void;
  version: string;
  workCalendarUrl?: string | null;
  children: ReactNode;
}) {
  const [skin, setSkin] = useState(readStoredAppSkin);

  useEffect(() => {
    storeAppSkin(skin);
  }, [skin]);

  return (
    <div className="app-shell" data-skin={skin}>
      <IconRail
        section={section}
        onSectionChange={onSectionChange}
        version={version}
        workCalendarUrl={workCalendarUrl}
        isAdmin={user.role === "admin"}
        teamName={user.team.name}
        teamLogoUrl={user.team.logoUrl}
      />
      <ContextRail section={section} />
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-topbar-mark" aria-hidden="true">
            <BrandMark logoUrl={user.team.logoUrl} teamName={user.team.name} />
          </div>
          <GlobalSearch onOpenSection={onSectionChange} />
          <SkinSelector skin={skin} onSkinChange={setSkin} />
          <span className="team-name">{user.team.name}</span>
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
