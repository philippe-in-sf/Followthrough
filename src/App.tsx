import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import type { User } from "./api/types";
import { AppShell, type AppSection } from "./components/AppShell";
import { AuthPage } from "./features/auth/AuthPage";
import { DashboardPage, type DashboardRecordTarget } from "./features/dashboard/DashboardPage";
import { DecisionsPage } from "./features/decisions/DecisionsPage";
import { MeetingsPage } from "./features/meetings/MeetingsPage";
import { PeoplePage } from "./features/people/PeoplePage";
import { TasksPage } from "./features/tasks/TasksPage";
import { appVersion } from "./version";

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
}: {
  section: AppSection;
  focusedRecord: FocusTarget | null;
  onDashboardRecordOpen: (target: DashboardRecordTarget) => void;
  onRecordFocusHandled: () => void;
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
  }
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [section, setSection] = useState<AppSection>("Dashboard");
  const [focusedRecord, setFocusedRecord] = useState<FocusTarget | null>(null);

  useEffect(() => {
    api
      .me()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null));
  }, []);

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

  if (user === undefined) return <main className="loading">Loading...</main>;
  if (!user) return <AuthPage onAuth={setUser} />;

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AppShell user={user} section={section} onSectionChange={changeSection} onLogout={logout} version={appVersion}>
      {renderSection({
        section,
        focusedRecord,
        onDashboardRecordOpen: openDashboardRecord,
        onRecordFocusHandled: clearFocusedRecord,
      })}
    </AppShell>
  );
}
