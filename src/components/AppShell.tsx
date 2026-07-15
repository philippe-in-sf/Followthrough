import { Bell, BellOff, LogOut } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "../api/types";
import { readStoredAppSkin, storeAppSkin } from "../appSkins";
import { loadClientConfig } from "../clientConfig";
import { BrandMark } from "./BrandMark";
import { ContextRail } from "./ContextRail";
import { GlobalSearch } from "./GlobalSearch";
import { GuidedTour } from "./GuidedTour";
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
  onEnableNotifications,
  onStopImpersonation,
  notificationStatus,
  version,
  workCalendarUrl = loadClientConfig().workCalendarUrl,
  children,
}: {
  user: User;
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  onLogout: () => void;
  onEnableNotifications: () => void;
  onStopImpersonation: () => void;
  notificationStatus: "unsupported" | "disabled" | "enabled";
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
        isAdmin={user.role === "admin" || user.role === "owner"}
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
          <GuidedTour section={section} onSectionChange={onSectionChange} userId={user.id} />
          <span className="team-name">{user.team.name}</span>
          <span className="user-name">{user.name}</span>
          {notificationStatus !== "unsupported" ? (
            <button
              className="icon-button"
              onClick={onEnableNotifications}
              aria-label={
                notificationStatus === "enabled"
                  ? "Task assignment notifications enabled"
                  : "Enable task assignment notifications"
              }
              title={
                notificationStatus === "enabled"
                  ? "Task assignment notifications enabled"
                  : "Enable task assignment notifications"
              }
              type="button"
            >
              {notificationStatus === "enabled" ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
          ) : null}
          <button className="icon-button sign-out-button" onClick={onLogout} aria-label="Sign out" type="button">
            <LogOut size={18} />
          </button>
        </header>
        {user.impersonation ? (
          <div className="impersonation-banner" role="status">
            <span>
              Viewing as <strong>{user.name}</strong>. Changes are disabled.
            </span>
            <button className="secondary-button" onClick={onStopImpersonation} type="button">
              Stop viewing as user
            </button>
          </div>
        ) : null}
        <MobileSectionSummary section={section} />
        {children}
      </div>
    </div>
  );
}
