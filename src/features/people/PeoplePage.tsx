import { type FormEvent, useEffect, useState } from "react";
import type { AuditLogDto, PersonDto, PersonRelatedRecordsDto } from "../../../shared/types";
import { api } from "../../api/client";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";

function formatDate(value: string | null) {
  return value ?? "No due date";
}

function formatMeetingTime(value: string) {
  return new Date(value).toLocaleString();
}

export function PeoplePage() {
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [peopleAudits, setPeopleAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [relatedRecords, setRelatedRecords] = useState<Record<string, PersonRelatedRecordsDto>>({});
  const [selectedPersonPublicId, setSelectedPersonPublicId] = useState<string | null>(null);
  const [editingPersonPublicId, setEditingPersonPublicId] = useState<string | null>(null);
  const [loadingRecordsPublicId, setLoadingRecordsPublicId] = useState<string | null>(null);
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
      name: String(form.get("name")),
      email: String(form.get("email")),
    });
    formElement.reset();
    await load();
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

  function cancelEdit() {
    setEditingPersonPublicId(null);
  }

  async function updatePerson(event: FormEvent<HTMLFormElement>, publicId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.people.update(publicId, {
      name: String(form.get("name")),
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
        <FormField label="Name">
          <input name="name" required />
        </FormField>
        <FormField label="Email">
          <input name="email" type="email" />
        </FormField>
        <button className="primary-button">Add person</button>
      </form>
      {people.length === 0 ? (
        <EmptyState title="No people" detail="Add people for assignees and attendees." />
      ) : (
        <div className="record-list">
          {people.map((person) => (
            <div className="person-record" key={person.publicId}>
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
                  className="secondary-button"
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
                  <FormField label="Name">
                    <input name="name" required defaultValue={person.name} />
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
                  <AuditLog events={peopleAudits[person.publicId] ?? []} />
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
                                <strong>{meeting.title}</strong>
                                <span>
                                  {meeting.publicId} - {formatMeetingTime(meeting.startsAt)}
                                </span>
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
                                <strong>{task.description}</strong>
                                <span>
                                  {task.publicId} - {task.status} - {formatDate(task.dueDate)}
                                </span>
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
                                <strong>{decision.decisionText}</strong>
                                <span>
                                  {decision.publicId} - {decision.decisionDate} -{" "}
                                  {decision.meetingPublicId}
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
