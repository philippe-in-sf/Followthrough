import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import type { User } from "./api/types";
import { AppShell, type AppSection } from "./components/AppShell";
import { loadClientConfig } from "./clientConfig";
import { AuthPage } from "./features/auth/AuthPage";
import { AdminPage } from "./features/admin/AdminPage";
import { DashboardPage, type DashboardRecordTarget } from "./features/dashboard/DashboardPage";
import { DecisionsPage } from "./features/decisions/DecisionsPage";
import { MeetingsPage } from "./features/meetings/MeetingsPage";
import { PeoplePage } from "./features/people/PeoplePage";
import { TasksPage } from "./features/tasks/TasksPage";
import { appVersion } from "./version";
import type { UserPreferencesDto } from "../shared/types";
import type { TeamDto } from "../shared/types";

type FocusableSection = Extract<AppSection, "Tasks" | "Meetings" | "Decisions">;

type FocusTarget = {
  publicId: string;
  section: FocusableSection;
};

const sectionByDashboardRecord: Record<DashboardRecordTarget["type"], FocusableSection> = {
  task: "Tasks",
  meeting: "Meetings",
  decision: "Decisions",
};

function focusPublicId(section: FocusableSection, focusedRecord: FocusTarget | null) {
  return focusedRecord?.section === section ? focusedRecord.publicId : null;
}

function renderSection({
  section,
  focusedRecord,
  onDashboardRecordOpen,
  onRecordFocusHandled,
  workCalendarUrl,
  onWorkCalendarUrlChange,
  googleCalendarConfigured,
  googleCalendarConnected,
  googleCalendarEmail,
  onGoogleCalendarConnectionChange,
  user,
  onTeamChange,
}: {
  section: AppSection;
  focusedRecord: FocusTarget | null;
  onDashboardRecordOpen: (target: DashboardRecordTarget) => void;
  onRecordFocusHandled: () => void;
  workCalendarUrl: string | null;
  onWorkCalendarUrlChange: (workCalendarUrl: string | null) => void;
  googleCalendarConfigured: boolean;
  googleCalendarConnected: boolean;
  googleCalendarEmail: string | null;
  onGoogleCalendarConnectionChange: (connected: boolean, email: string | null) => void;
  user: User;
  onTeamChange: (team: TeamDto) => void;
}) {
  switch (section) {
    case "Dashboard":
      return <DashboardPage onOpenRecord={onDashboardRecordOpen} />;
    case "Tasks":
      return (
        <TasksPage
          focusTaskPublicId={focusPublicId("Tasks", focusedRecord)}
          onTaskFocusHandled={onRecordFocusHandled}
        />
      );
    case "Meetings":
      return (
        <MeetingsPage
          focusMeetingPublicId={focusPublicId("Meetings", focusedRecord)}
          onMeetingFocusHandled={onRecordFocusHandled}
          workCalendarUrl={workCalendarUrl}
          onWorkCalendarUrlChange={onWorkCalendarUrlChange}
          googleCalendarConfigured={googleCalendarConfigured}
          googleCalendarConnected={googleCalendarConnected}
          googleCalendarEmail={googleCalendarEmail}
          onGoogleCalendarConnectionChange={onGoogleCalendarConnectionChange}
        />
      );
    case "Decisions":
      return (
        <DecisionsPage
          focusDecisionPublicId={focusPublicId("Decisions", focusedRecord)}
          onDecisionFocusHandled={onRecordFocusHandled}
        />
      );
    case "People":
      return <PeoplePage />;
    case "Admin":
      return user.role === "admin" ? <AdminPage onTeamChange={onTeamChange} /> : null;
  }
}

export function App() {
  const fallbackWorkCalendarUrl = loadClientConfig().workCalendarUrl;
  const fallbackPreferences = useMemo<UserPreferencesDto>(
    () => ({
      workCalendarUrl: fallbackWorkCalendarUrl,
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

  const setTeam = useCallback((team: TeamDto) => {
    setUser((current) => (current ? { ...current, team } : current));
  }, []);

  if (user === undefined) return <main className="loading">Loading...</main>;
  if (!user) return <AuthPage onAuth={handleAuth} />;

  async function logout() {
    await api.logout();
    setUser(null);
    setPreferences(fallbackPreferences);
  }

  const calendarShortcutUrl = user.team.workCalendarUrl ?? preferences.workCalendarUrl;

  return (
    <AppShell
      user={user}
      section={section}
      onSectionChange={changeSection}
      onLogout={logout}
      version={appVersion}
      workCalendarUrl={calendarShortcutUrl}
    >
      {renderSection({
        section,
        focusedRecord,
        onDashboardRecordOpen: openDashboardRecord,
        onRecordFocusHandled: clearFocusedRecord,
        workCalendarUrl: calendarShortcutUrl,
        onWorkCalendarUrlChange: setWorkCalendarUrl,
        googleCalendarConfigured: preferences.googleCalendarConfigured,
        googleCalendarConnected: preferences.googleCalendarConnected,
        googleCalendarEmail: preferences.googleCalendarEmail,
        onGoogleCalendarConnectionChange: setGoogleCalendarConnection,
        user,
        onTeamChange: setTeam,
      })}
    </AppShell>
  );
}
