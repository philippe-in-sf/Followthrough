import { useEffect, useState } from "react";
import type { DecisionDto } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";

export function DecisionsPage() {
  const [decisions, setDecisions] = useState<DecisionDto[]>([]);

  useEffect(() => {
    void api.decisions.list().then((result) => setDecisions(result.decisions));
  }, []);

  return (
    <main className="page">
      <header className="page-header">
        <h2>Decisions</h2>
      </header>
      {decisions.length === 0 ? (
        <EmptyState title="No decisions" detail="Record decisions from meetings or standalone context." />
      ) : (
        <div className="record-list">
          {decisions.map((decision) => (
            <article className="record-row" key={decision.publicId}>
              <div>
                <strong>{decision.decisionText}</strong>
                <span>{decision.context}</span>
              </div>
              <span>{decision.publicId}</span>
              <span>{decision.decisionDate}</span>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
