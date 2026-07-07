import { type FormEvent, useEffect, useState } from "react";
import type { AuditLogDto, PersonDto, PersonRelatedRecordsDto } from "../../../shared/types";
import { api } from "../../api/client";
import { hasActiveBlockers, hasBlockers, hasClearedBlockers } from "../../blockers";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { LinkedText, type RecordReferenceTarget } from "../../components/LinkedText";
import { StatusBadge } from "../../components/StatusBadge";
import { scrollRecordIntoView } from "../../recordFocus";

function formatDate(value: string | null) {
  return value ?? "No due date";
}

function formatMeetingTime(value: string) {
  return new Date(value).toLocaleString();
}

export function PeoplePage({
  focusPersonPublicId,
  onPersonFocusHandled,
  onRecordReferenceOpen,
}: {
  focusPersonPublicId?: string | null;
  onPersonFocusHandled?: () => void;
  onRecordReferenceOpen?: (target: RecordReferenceTarget) => void;
}) {
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [peopleAudits, setPeopleAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [relatedRecords, setRelatedRecords] = useState<Record<string, PersonRelatedRecordsDto>>({});
  const [selectedPersonPublicId, setSelectedPersonPublicId] = useState<string | null>(null);
  const [editingPersonPublicId, setEditingPersonPublicId] = useState<string | null>(null);
  const [archivePersonPublicId, setArchivePersonPublicId] = useState("");
  const [mergeSourcePublicId, setMergeSourcePublicId] = useState("");
  const [mergeTargetPublicId, setMergeTargetPublicId] = useState("");
  const [loadingRecordsPublicId, setLoadingRecordsPublicId] = useState<string | null>(null);
  const [peopleAdminError, setPeopleAdminError] = useState("");
  const [recordsError, setRecordsError] = useState("");

  async function load() {
    const result = await api.people.list();
    setPeople(result.people);

    const auditEntries = await Promise.all(
      result.people.map(async (person) => {
        const auditResult = await api.people
          .audit(person.publicId)
          .catch(() => ({ auditEvents: [] as AuditLogDto[] }));
        return [person.publicId, auditResult.auditEvents ?? []] as const;
      }),
    );
    setPeopleAudits(Object.fromEntries(auditEntries));
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await api.people.create({
      firstName: String(form.get("firstName")),
      lastName: String(form.get("lastName")),
      email: String(form.get("email")),
    });
    formElement.reset();
    await load();
  }

  async function archivePerson(person: PersonDto) {
    if (!window.confirm(`Archive ${person.name}?`)) return;

    setPeopleAdminError("");
    try {
      await api.people.archive(person.publicId);
      if (selectedPersonPublicId === person.publicId) setSelectedPersonPublicId(null);
      if (editingPersonPublicId === person.publicId) setEditingPersonPublicId(null);
      setArchivePersonPublicId("");
      setRelatedRecords((current) => {
        const next = { ...current };
        delete next[person.publicId];
        return next;
      });
      await load();
    } catch {
      setPeopleAdminError(`Could not archive ${person.name}`);
    }
  }

  async function archiveSelectedPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = people.find((item) => item.publicId === archivePersonPublicId);
    if (!person) {
      setPeopleAdminError("Choose a person to archive");
      return;
    }

    await archivePerson(person);
  }

  async function mergePeople(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = people.find((person) => person.publicId === mergeSourcePublicId);
    const target = people.find((person) => person.publicId === mergeTargetPublicId);

    if (!source || !target) {
      setPeopleAdminError("Choose two people to merge");
      return;
    }

    if (source.publicId === target.publicId) {
      setPeopleAdminError("Choose two different people to merge");
      return;
    }

    if (!window.confirm(`Merge ${source.name} into ${target.name}?`)) return;

    setPeopleAdminError("");
    try {
      await api.people.merge(source.publicId, { targetPublicId: target.publicId });
      if (selectedPersonPublicId === source.publicId) setSelectedPersonPublicId(null);
      if (editingPersonPublicId === source.publicId) setEditingPersonPublicId(null);
      setMergeSourcePublicId("");
      setMergeTargetPublicId("");
      setRelatedRecords((current) => {
        const next = { ...current };
        delete next[source.publicId];
        delete next[target.publicId];
        return next;
      });
      await load();
    } catch {
      setPeopleAdminError(`Could not merge ${source.name} into ${target.name}`);
    }
  }

  function editPerson(person: PersonDto) {
    setEditingPersonPublicId(person.publicId);
  }

  async function selectPerson(person: PersonDto) {
    setSelectedPersonPublicId(person.publicId);
    setRecordsError("");
    if (relatedRecords[person.publicId]) return;

    setLoadingRecordsPublicId(person.publicId);
    try {
      const records = await api.people.records(person.publicId);
      setRelatedRecords((current) => ({ ...current, [person.publicId]: records }));
    } catch {
      setRecordsError(`Could not load records for ${person.name}`);
    } finally {
      setLoadingRecordsPublicId(null);
    }
  }

  useEffect(() => {
    if (!focusPersonPublicId) return;
    const person = people.find((item) => item.publicId === focusPersonPublicId);
    if (!person) return;

    void selectPerson(person).then(() => {
      scrollRecordIntoView(`person-${person.publicId}`);
      onPersonFocusHandled?.();
    });
  }, [focusPersonPublicId, people, onPersonFocusHandled]);

  function cancelEdit() {
    setEditingPersonPublicId(null);
  }

  async function updatePerson(event: FormEvent<HTMLFormElement>, publicId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.people.update(publicId, {
      firstName: String(form.get("firstName")),
      lastName: String(form.get("lastName")),
      email: String(form.get("email")),
    });
    setEditingPersonPublicId(null);
    await load();
  }

  return (
    <main className="page">
      <header className="page-header">
        <h2>People</h2>
      </header>
      <form className="inline-form" onSubmit={createPerson}>
        <FormField label="First name">
          <input name="firstName" placeholder="Morgan" required />
        </FormField>
        <FormField label="Last name">
          <input name="lastName" placeholder="Lee" />
        </FormField>
        <FormField label="Email">
          <input name="email" type="email" />
        </FormField>
        <button className="primary-button">Add person</button>
      </form>
      {people.length > 0 ? (
        <section aria-label="People admin" className="people-admin-panel">
          <h3>Admin</h3>
          {people.length > 1 ? (
            <form aria-label="Merge people" className="people-admin-form" onSubmit={mergePeople}>
              <FormField label="Merge from">
                <select
                  value={mergeSourcePublicId}
                  onChange={(event) => setMergeSourcePublicId(event.target.value)}
                >
                  <option value="">Select person</option>
                  {people.map((person) => (
                    <option key={person.publicId} value={person.publicId}>
                      {person.name} ({person.publicId})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Merge into">
                <select
                  value={mergeTargetPublicId}
                  onChange={(event) => setMergeTargetPublicId(event.target.value)}
                >
                  <option value="">Select person</option>
                  {people.map((person) => (
                    <option key={person.publicId} value={person.publicId}>
                      {person.name} ({person.publicId})
                    </option>
                  ))}
                </select>
              </FormField>
              <button className="secondary-button" type="submit">
                Merge people
              </button>
            </form>
          ) : null}
          <form
            aria-label="Archive person admin"
            className="people-admin-form people-archive-form"
            onSubmit={archiveSelectedPerson}
          >
            <FormField label="Archive person">
              <select
                value={archivePersonPublicId}
                onChange={(event) => setArchivePersonPublicId(event.target.value)}
              >
                <option value="">Select person</option>
                {people.map((person) => (
                  <option key={person.publicId} value={person.publicId}>
                    {person.name} ({person.publicId})
                  </option>
                ))}
              </select>
            </FormField>
            <button className="danger-button" type="submit">
              Archive selected person
            </button>
          </form>
        </section>
      ) : null}
      {peopleAdminError ? <p className="form-error">{peopleAdminError}</p> : null}
      {people.length === 0 ? (
        <EmptyState title="No people" detail="Add people for assignees and attendees." />
      ) : (
        <div className="record-list">
          {people.map((person) => (
            <div className="person-record" id={`person-${person.publicId}`} key={person.publicId}>
              <article
                className={`record-row person-row ${
                  selectedPersonPublicId === person.publicId ? "person-row-selected" : ""
                }`}
                aria-label={`Person ${person.publicId}`}
              >
                <button
                  aria-controls={`related-records-${person.publicId}`}
                  aria-expanded={selectedPersonPublicId === person.publicId}
                  aria-label={`View records for ${person.publicId}`}
                  className="person-record-trigger"
                  type="button"
                  onClick={() => void selectPerson(person)}
                >
                  <div>
                    <strong>{person.name}</strong>
                    <span>{person.email || "No email"}</span>
                  </div>
                  <span>{person.publicId}</span>
                </button>
                <button
                  className="secondary-button person-row-edit"
                  type="button"
                  onClick={() => editPerson(person)}
                >
                  Edit {person.publicId}
                </button>
              </article>
              {editingPersonPublicId === person.publicId ? (
                <form
                  aria-label={`Edit ${person.publicId}`}
                  className="person-edit-form"
                  onSubmit={(event) => updatePerson(event, person.publicId)}
                >
                  <FormField label="First name">
                    <input
                      name="firstName"
                      placeholder="Morgan"
                      required
                      defaultValue={person.firstName}
                    />
                  </FormField>
                  <FormField label="Last name">
                    <input name="lastName" placeholder="Lee" defaultValue={person.lastName} />
                  </FormField>
                  <FormField label="Email">
                    <input name="email" type="email" defaultValue={person.email ?? ""} />
                  </FormField>
                  <div className="form-actions">
                    <button className="primary-button" type="submit">
                      Save person
                    </button>
                    <button className="secondary-button" type="button" onClick={cancelEdit}>
                      Cancel edit {person.publicId}
                    </button>
                  </div>
                  <AuditLog events={peopleAudits[person.publicId] ?? []} onRecordOpen={onRecordReferenceOpen} />
                </form>
              ) : null}
              {selectedPersonPublicId === person.publicId ? (
                <section
                  aria-label={`Related records for ${person.publicId}`}
                  className="person-related-records"
                  id={`related-records-${person.publicId}`}
                >
                  <header className="person-related-header">
                    <h3>{person.name}</h3>
                    <span>
                      {loadingRecordsPublicId === person.publicId ? "Loading records" : "Records"}
                    </span>
                  </header>
                  {recordsError ? <p className="form-error">{recordsError}</p> : null}
                  {relatedRecords[person.publicId] ? (
                    <div className="person-related-grid">
                      <section className="person-related-section">
                        <h4>Meetings</h4>
                        {relatedRecords[person.publicId].meetings.length === 0 ? (
                          <p className="muted">No meetings</p>
                        ) : (
                          <ul className="person-related-list">
                            {relatedRecords[person.publicId].meetings.map((meeting) => (
                              <li key={meeting.publicId}>
                                <strong>
                                  <LinkedText text={meeting.title} onRecordOpen={onRecordReferenceOpen} />
                                </strong>
                                <span>
                                  <LinkedText text={meeting.publicId} onRecordOpen={onRecordReferenceOpen} /> -{" "}
                                  {formatMeetingTime(meeting.startsAt)}
                                  {hasActiveBlockers(meeting) ? (
                                    <StatusBadge label="Blocker" tone="bad" />
                                  ) : null}
                                  {hasClearedBlockers(meeting) ? (
                                    <StatusBadge label="Blocker cleared" tone="good" />
                                  ) : null}
                                </span>
                                {hasBlockers(meeting) ? (
                                  <span className="person-related-blocker">
                                    <LinkedText text={meeting.blockers} onRecordOpen={onRecordReferenceOpen} />
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                      <section className="person-related-section">
                        <h4>Tasks</h4>
                        {relatedRecords[person.publicId].tasks.length === 0 ? (
                          <p className="muted">No tasks</p>
                        ) : (
                          <ul className="person-related-list">
                            {relatedRecords[person.publicId].tasks.map((task) => (
                              <li key={task.publicId}>
                                <strong>
                                  <LinkedText text={task.description} onRecordOpen={onRecordReferenceOpen} />
                                </strong>
                                <span>
                                  <LinkedText text={task.publicId} onRecordOpen={onRecordReferenceOpen} /> -{" "}
                                  {task.status} - {formatDate(task.dueDate)}
                                  {hasActiveBlockers(task) ? (
                                    <StatusBadge label="Blocker" tone="bad" />
                                  ) : null}
                                  {hasClearedBlockers(task) ? (
                                    <StatusBadge label="Blocker cleared" tone="good" />
                                  ) : null}
                                </span>
                                {hasBlockers(task) ? (
                                  <span className="person-related-blocker">
                                    <LinkedText text={task.blockers} onRecordOpen={onRecordReferenceOpen} />
                                  </span>
                                ) : null}
                                {(task.notes ?? "").trim() ? (
                                  <span className="person-related-note">
                                    <LinkedText text={task.notes} onRecordOpen={onRecordReferenceOpen} />
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                      <section className="person-related-section">
                        <h4>Decisions</h4>
                        {relatedRecords[person.publicId].decisions.length === 0 ? (
                          <p className="muted">No decisions</p>
                        ) : (
                          <ul className="person-related-list">
                            {relatedRecords[person.publicId].decisions.map((decision) => (
                              <li key={decision.publicId}>
                                <strong>
                                  <LinkedText text={decision.decisionText} onRecordOpen={onRecordReferenceOpen} />
                                </strong>
                                <span>
                                  <LinkedText text={decision.publicId} onRecordOpen={onRecordReferenceOpen} /> -{" "}
                                  {decision.decisionDate} -{" "}
                                  {decision.meetingPublicId ? (
                                    <LinkedText text={decision.meetingPublicId} onRecordOpen={onRecordReferenceOpen} />
                                  ) : (
                                    "No meeting"
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
