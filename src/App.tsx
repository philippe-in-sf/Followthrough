import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import type { User } from "./api/types";
import { AppShell, type AppSection } from "./components/AppShell";
import type { RecordReferenceTarget } from "./components/LinkedText";
import { loadClientConfig } from "./clientConfig";
import { AuthPage } from "./features/auth/AuthPage";
import { AdminPage } from "./features/admin/AdminPage";
import { DashboardPage, type DashboardRecordTarget } from "./features/dashboard/DashboardPage";
import { DecisionsPage } from "./features/decisions/DecisionsPage";
import { MeetingsPage } from "./features/meetings/MeetingsPage";
import { MeetingNotesPage } from "./features/notes/MeetingNotesPage";
import { PeoplePage } from "./features/people/PeoplePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { useTaskAssignmentNotifications } from "./notifications";
import { appVersion } from "./version";
import type { DashboardOrganization, UserPreferencesDto } from "../shared/types";
import type { TeamDto } from "../shared/types";

type FocusableSection = Extract<AppSection, "Tasks" | "Meetings" | "Decisions" | "People">;

type FocusTarget = {
  kind?: "record" | "series";
  publicId: string;
  section: FocusableSection;
};

const sectionByDashboardRecord: Record<DashboardRecordTarget["type"], FocusableSection> = {
  task: "Tasks",
  meeting: "Meetings",
  decision: "Decisions",
};

const sectionByRecordReference: Record<Exclude<RecordReferenceTarget["type"], "series">, FocusableSection> = {
  decision: "Decisions",
  meeting: "Meetings",
  person: "People",
  task: "Tasks",
};

function focusPublicId(section: FocusableSection, focusedRecord: FocusTarget | null) {
  return focusedRecord?.section === section && focusedRecord.kind !== "series"
    ? focusedRecord.publicId
    : null;
}

function focusSeriesPublicId(focusedRecord: FocusTarget | null) {
  return focusedRecord?.section === "Meetings" && focusedRecord.kind === "series"
    ? focusedRecord.publicId
    : null;
}

function renderSection({
  section,
  focusedRecord,
  onDashboardRecordOpen,
  onRecordReferenceOpen,
  onRecordFocusHandled,
  workCalendarUrl,
  onWorkCalendarUrlChange,
  dashboardOrganization,
  onDashboardOrganizationChange,
  googleCalendarConfigured,
  googleCalendarConnected,
  googleCalendarEmail,
  onGoogleCalendarConnectionChange,
  user,
  onTeamChange,
  currentUserId,
  onImpersonate,
  onLeaveTeam,
}: {
  section: AppSection;
  focusedRecord: FocusTarget | null;
  onDashboardRecordOpen: (target: DashboardRecordTarget) => void;
  onRecordReferenceOpen: (target: RecordReferenceTarget) => void;
  onRecordFocusHandled: () => void;
  workCalendarUrl: string | null;
  onWorkCalendarUrlChange: (workCalendarUrl: string | null) => void;
  dashboardOrganization: DashboardOrganization;
  onDashboardOrganizationChange: (organization: DashboardOrganization) => Promise<void>;
  googleCalendarConfigured: boolean;
  googleCalendarConnected: boolean;
  googleCalendarEmail: string | null;
  onGoogleCalendarConnectionChange: (connected: boolean, email: string | null) => void;
  user: User;
  onTeamChange: (team: TeamDto) => void;
  currentUserId: number;
  onImpersonate: (user: User) => void;
  onLeaveTeam: () => Promise<void>;
}) {
  switch (section) {
    case "Dashboard":
      return (
        <DashboardPage
          dashboardOrganization={dashboardOrganization}
          onDashboardOrganizationChange={onDashboardOrganizationChange}
          onOpenRecord={onDashboardRecordOpen}
          onRecordReferenceOpen={onRecordReferenceOpen}
        />
      );
    case "Tasks":
      return (
        <TasksPage
          focusTaskPublicId={focusPublicId("Tasks", focusedRecord)}
          onReferenceOpen={onRecordReferenceOpen}
          onTaskFocusHandled={onRecordFocusHandled}
        />
      );
    case "Meetings":
      return (
        <MeetingsPage
          focusSeriesPublicId={focusSeriesPublicId(focusedRecord)}
          focusMeetingPublicId={focusPublicId("Meetings", focusedRecord)}
          onMeetingFocusHandled={onRecordFocusHandled}
          onSeriesFocusHandled={onRecordFocusHandled}
          workCalendarUrl={workCalendarUrl}
          onWorkCalendarUrlChange={onWorkCalendarUrlChange}
          googleCalendarConfigured={googleCalendarConfigured}
          googleCalendarConnected={googleCalendarConnected}
          googleCalendarEmail={googleCalendarEmail}
          onGoogleCalendarConnectionChange={onGoogleCalendarConnectionChange}
          onRecordReferenceOpen={onRecordReferenceOpen}
        />
      );
    case "Notes":
      return (
        <MeetingNotesPage
          onOpenMeeting={(publicId) => onRecordReferenceOpen({ type: "meeting", publicId })}
          onRecordReferenceOpen={onRecordReferenceOpen}
        />
      );
    case "Decisions":
      return (
        <DecisionsPage
          focusDecisionPublicId={focusPublicId("Decisions", focusedRecord)}
          onDecisionFocusHandled={onRecordFocusHandled}
          onRecordReferenceOpen={onRecordReferenceOpen}
        />
      );
    case "People":
      return (
        <PeoplePage
          focusPersonPublicId={focusPublicId("People", focusedRecord)}
          onPersonFocusHandled={onRecordFocusHandled}
          onRecordReferenceOpen={onRecordReferenceOpen}
        />
      );
    case "Settings":
      return <SettingsPage user={user} onLeaveTeam={onLeaveTeam} />;
    case "Admin":
      return user.role === "admin" || user.role === "owner" ? (
        <AdminPage
          currentUserId={currentUserId}
          onImpersonate={onImpersonate}
          onTeamChange={onTeamChange}
        />
      ) : null;
  }
}

export function App() {
  const fallbackWorkCalendarUrl = loadClientConfig().workCalendarUrl;
  const fallbackPreferences = useMemo<UserPreferencesDto>(
    () => ({
      workCalendarUrl: fallbackWorkCalendarUrl,
      weeklyDigestEnabled: false,
      dashboardOrganization: "workflow",
      googleCalendarConfigured: false,
      googleCalendarConnected: false,
      googleCalendarEmail: null,
    }),
    [fallbackWorkCalendarUrl],
  );
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [section, setSection] = useState<AppSection>("Dashboard");
  const [focusedRecord, setFocusedRecord] = useState<FocusTarget | null>(null);
  const [preferences, setPreferences] = useState<UserPreferencesDto>(fallbackPreferences);

  const loadPreferences = useCallback(async () => {
    try {
      const nextPreferences = await api.preferences.get();
      setPreferences({
        ...nextPreferences,
        workCalendarUrl: nextPreferences.workCalendarUrl ?? fallbackWorkCalendarUrl,
        dashboardOrganization: nextPreferences.dashboardOrganization ?? "workflow",
      });
    } catch {
      setPreferences(fallbackPreferences);
    }
  }, [fallbackPreferences, fallbackWorkCalendarUrl]);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const result = await api.me();
        if (!active) return;
        setUser(result.user);
        if (result.user) {
          await loadPreferences();
        } else {
          setPreferences(fallbackPreferences);
        }
      } catch {
        if (!active) return;
        setUser(null);
        setPreferences(fallbackPreferences);
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, [fallbackPreferences, loadPreferences]);

  const handleAuth = useCallback(
    (nextUser: User) => {
      setUser(nextUser);
      void loadPreferences();
    },
    [loadPreferences],
  );

  const changeSection = useCallback((nextSection: AppSection) => {
    setFocusedRecord(null);
    setSection(nextSection);
  }, []);

  const openDashboardRecord = useCallback((target: DashboardRecordTarget) => {
    const nextSection = sectionByDashboardRecord[target.type];
    setFocusedRecord({ section: nextSection, publicId: target.publicId });
    setSection(nextSection);
  }, []);

  const openRecordReference = useCallback((target: RecordReferenceTarget) => {
    if (target.type === "series") {
      setFocusedRecord({ kind: "series", section: "Meetings", publicId: target.publicId });
      setSection("Meetings");
      return;
    }

    const nextSection = sectionByRecordReference[target.type];
    setFocusedRecord({ section: nextSection, publicId: target.publicId });
    setSection(nextSection);
  }, []);

  const clearFocusedRecord = useCallback(() => {
    setFocusedRecord(null);
  }, []);

  const setWorkCalendarUrl = useCallback(
    (workCalendarUrl: string | null) => {
      setPreferences((current) => ({
        ...current,
        workCalendarUrl: workCalendarUrl ?? fallbackWorkCalendarUrl,
      }));
    },
    [fallbackWorkCalendarUrl],
  );

  const setGoogleCalendarConnection = useCallback(
    (connected: boolean, email: string | null) => {
      setPreferences((current) => ({
        ...current,
        googleCalendarConnected: connected,
        googleCalendarEmail: email,
      }));
    },
    [],
  );

  const setDashboardOrganization = useCallback(
    async (dashboardOrganization: DashboardOrganization) => {
      setPreferences((current) => ({ ...current, dashboardOrganization }));
      try {
        const nextPreferences = await api.preferences.update({ dashboardOrganization });
        setPreferences({
          ...nextPreferences,
          workCalendarUrl: nextPreferences.workCalendarUrl ?? fallbackWorkCalendarUrl,
          dashboardOrganization: nextPreferences.dashboardOrganization ?? dashboardOrganization,
        });
      } catch (error) {
        await loadPreferences();
        throw error;
      }
    },
    [fallbackWorkCalendarUrl, loadPreferences],
  );

  const setTeam = useCallback((team: TeamDto) => {
    setUser((current) => (current ? { ...current, team } : current));
  }, []);

  const startImpersonation = useCallback(
    (nextUser: User) => {
      setUser(nextUser);
      setSection("Dashboard");
      setFocusedRecord(null);
      void loadPreferences();
    },
    [loadPreferences],
  );

  const { notificationStatus, enableNotifications } = useTaskAssignmentNotifications(Boolean(user));

  if (user === undefined) return <main className="loading">Loading...</main>;
  if (!user) return <AuthPage onAuth={handleAuth} />;
  const currentUser = user;

  async function logout() {
    await api.logout();
    setUser(null);
    setPreferences(fallbackPreferences);
  }

  async function stopImpersonation() {
    const result = await api.stopImpersonation();
    setUser(result.user);
    setSection("Admin");
    setFocusedRecord(null);
    void loadPreferences();
  }

  async function leaveTeam() {
    const confirmed = window.confirm(
      `Leave ${currentUser.team.name}? You will lose access to this team's tasks, meetings, decisions, and people records.`,
    );
    if (!confirmed) return;

    const result = await api.leaveTeam();
    setUser(result.user);
    setSection("Dashboard");
    setFocusedRecord(null);
    void loadPreferences();
  }

  const calendarShortcutUrl = user.team.workCalendarUrl ?? preferences.workCalendarUrl;

  return (
    <AppShell
      user={currentUser}
      section={section}
      onSectionChange={changeSection}
      onLogout={logout}
      onEnableNotifications={enableNotifications}
      notificationStatus={notificationStatus}
      onStopImpersonation={stopImpersonation}
      version={appVersion}
      workCalendarUrl={calendarShortcutUrl}
    >
      {renderSection({
        section,
        focusedRecord,
        onDashboardRecordOpen: openDashboardRecord,
        onRecordReferenceOpen: openRecordReference,
        onRecordFocusHandled: clearFocusedRecord,
        workCalendarUrl: calendarShortcutUrl,
        onWorkCalendarUrlChange: setWorkCalendarUrl,
        dashboardOrganization: preferences.dashboardOrganization,
        onDashboardOrganizationChange: setDashboardOrganization,
        googleCalendarConfigured: preferences.googleCalendarConfigured,
        googleCalendarConnected: preferences.googleCalendarConnected,
        googleCalendarEmail: preferences.googleCalendarEmail,
        onGoogleCalendarConnectionChange: setGoogleCalendarConnection,
        user: currentUser,
        onTeamChange: setTeam,
        currentUserId: currentUser.id,
        onImpersonate: startImpersonation,
        onLeaveTeam: leaveTeam,
      })}
    </AppShell>
  );
}
