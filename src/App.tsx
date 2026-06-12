import { useEffect, useState } from "react";
import { api } from "./api/client";
import type { User } from "./api/types";
import { AppShell, type AppSection } from "./components/AppShell";
import { AuthPage } from "./features/auth/AuthPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { DecisionsPage } from "./features/decisions/DecisionsPage";
import { MeetingsPage } from "./features/meetings/MeetingsPage";
import { PeoplePage } from "./features/people/PeoplePage";
import { TasksPage } from "./features/tasks/TasksPage";
import { appVersion } from "./version";

function renderSection(section: AppSection) {
  switch (section) {
    case "Dashboard":
      return <DashboardPage />;
    case "Tasks":
      return <TasksPage />;
    case "Meetings":
      return <MeetingsPage />;
    case "Decisions":
      return <DecisionsPage />;
    case "People":
      return <PeoplePage />;
  }
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [section, setSection] = useState<AppSection>("Dashboard");

  useEffect(() => {
    api
      .me()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return <main className="loading">Loading...</main>;
  if (!user) return <AuthPage onAuth={setUser} />;

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AppShell user={user} section={section} onSectionChange={setSection} onLogout={logout} version={appVersion}>
      {renderSection(section)}
    </AppShell>
  );
}
