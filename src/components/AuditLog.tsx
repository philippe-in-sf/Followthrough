import type { AuditLogDto } from "../../shared/types";
import { LinkedText } from "./LinkedText";

type AuditTimeFormatOptions = {
  locale?: string;
  timeZone?: string;
};

function normalizeAuditTimestamp(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const looksLikeDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized);
  return looksLikeDateTime && !hasExplicitZone ? `${normalized}Z` : normalized;
}

export function formatAuditTime(value: string, options: AuditTimeFormatOptions = {}) {
  const date = new Date(normalizeAuditTimestamp(value));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(options.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
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
              <strong>
                <LinkedText text={event.summary} />
              </strong>
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
