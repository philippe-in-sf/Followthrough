import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api, type MeetingNotesRange } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { PaginatedItems } from "../../components/PaginatedItems";
import { RichNoteText } from "../../components/RichNotes";
import type { RecordReferenceTarget } from "../../components/LinkedText";
import type { MeetingNoteDto } from "../../../shared/types";

type MeetingNotesPageProps = {
  onOpenMeeting: (publicId: string) => void;
  onRecordReferenceOpen: (target: RecordReferenceTarget) => void;
};

const presetRanges: Array<{ value: MeetingNotesRange; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultCustomStart() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return toDateInputValue(date);
}

function formatMeetingDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function matchLabel(note: MeetingNoteDto) {
  if (note.matchReasons.length === 2) return "Created by you and attended";
  if (note.matchReasons.includes("creator")) return "Created by you";
  return "You attended";
}

export function MeetingNotesPage({ onOpenMeeting, onRecordReferenceOpen }: MeetingNotesPageProps) {
  const [range, setRange] = useState<MeetingNotesRange>("week");
  const [customStartDate, setCustomStartDate] = useState(defaultCustomStart);
  const [customEndDate, setCustomEndDate] = useState(() => toDateInputValue(new Date()));
  const [notes, setNotes] = useState<MeetingNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(
    () => ({
      range,
      ...(range === "custom"
        ? {
            startDate: customStartDate,
            endDate: customEndDate,
          }
        : {}),
    }),
    [customEndDate, customStartDate, range],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api.meetingNotes
      .list(query)
      .then((response) => {
        if (!active) return;
        setNotes(response.notes);
      })
      .catch((apiError: unknown) => {
        if (!active) return;
        setError(apiError instanceof ApiError ? apiError.message : "Could not load notes");
        setNotes([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  return (
    <main className="page my-notes-page">
      <header className="page-header my-notes-header">
        <div>
          <p className="eyebrow">Meeting notes</p>
          <h1>My notes</h1>
        </div>
        <div className="notes-range-toolbar" aria-label="Meeting notes date range">
          <div className="segmented-control">
            {presetRanges.map((item) => (
              <button
                aria-pressed={range === item.value}
                className={range === item.value ? "active" : ""}
                key={item.value}
                type="button"
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {range === "custom" ? (
            <div className="notes-custom-range">
              <label>
                <span>Start</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                />
              </label>
              <label>
                <span>End</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <section className="notes-result-list" aria-label="Meeting notes">
          <article className="note-result-card muted">Loading notes...</article>
        </section>
      ) : notes.length === 0 ? (
        <EmptyState
          title="No meeting notes found"
          detail={
            range === "custom"
              ? "Try another custom date range."
              : "Try a wider date range or capture notes in a meeting."
          }
        />
      ) : (
        <PaginatedItems
          items={notes}
          itemName="note"
          pageSize={8}
          getItemKey={(note) => note.publicId}
          resetKey={`${range}:${customStartDate}:${customEndDate}`}
        >
          {(visibleNotes) => (
            <section className="notes-result-list" aria-label="Meeting notes">
              {visibleNotes.map((note) => (
                <article className="note-result-card" key={note.publicId}>
                  <header className="note-result-header">
                    <div>
                      <p className="record-kicker">{note.publicId}</p>
                      <h2>{note.title.trim() || "Untitled meeting"}</h2>
                    </div>
                    <button
                      className="secondary-button icon-text-button"
                      type="button"
                      onClick={() => onOpenMeeting(note.publicId)}
                    >
                      <ExternalLink size={16} />
                      Open
                    </button>
                  </header>
                  <div className="note-result-meta">
                    <span>{formatMeetingDate(note.startsAt)}</span>
                    <span>{matchLabel(note)}</span>
                  </div>
                  {note.attendees.length > 0 ? (
                    <p className="note-result-attendees">
                      {note.attendees.map((attendee) => attendee.name).join(", ")}
                    </p>
                  ) : null}
                  <RichNoteText text={note.notes} onRecordOpen={onRecordReferenceOpen} />
                </article>
              ))}
            </section>
          )}
        </PaginatedItems>
      )}
    </main>
  );
}
