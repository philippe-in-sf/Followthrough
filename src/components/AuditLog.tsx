import type { AuditLogDto } from "../../shared/types";

function formatAuditTime(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function AuditLog({ events }: { events: AuditLogDto[] }) {
  return (
    <section className="audit-log" aria-label="Audit history">
      <h3>Audit history</h3>
      {events.length === 0 ? (
        <p className="muted">No audit entries</p>
      ) : (
        <ol className="audit-list">
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.summary}</strong>
              <span>
                {event.actorName ?? "Unknown"} - {formatAuditTime(event.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
