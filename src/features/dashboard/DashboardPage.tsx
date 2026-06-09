import { useEffect, useState } from "react";
import { api } from "../../api/client";

type DashboardSummary = Awaited<ReturnType<typeof api.dashboard>>;

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    void api.dashboard().then(setSummary);
  }, []);

  return (
    <main className="page">
      <h2>Workspace</h2>
      <div className="summary-grid">
        <section className="summary-panel">
          <h3>Overdue</h3>
          <strong>{summary?.alerts.overdue.length ?? 0}</strong>
        </section>
        <section className="summary-panel">
          <h3>Due soon</h3>
          <strong>{summary?.alerts.dueSoon.length ?? 0}</strong>
        </section>
      </div>
    </main>
  );
}
