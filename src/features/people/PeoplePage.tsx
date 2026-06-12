import { type FormEvent, useEffect, useState } from "react";
import type { AuditLogDto, PersonDto } from "../../../shared/types";
import { api } from "../../api/client";
import { AuditLog } from "../../components/AuditLog";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";

export function PeoplePage() {
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [peopleAudits, setPeopleAudits] = useState<Record<string, AuditLogDto[]>>({});
  const [editingPersonPublicId, setEditingPersonPublicId] = useState<string | null>(null);

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
              <article className="record-row" aria-label={`Person ${person.publicId}`}>
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.email || "No email"}</span>
                </div>
                <span>{person.publicId}</span>
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
