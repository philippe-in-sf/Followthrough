import { type FormEvent, useEffect, useState } from "react";
import type { PersonDto } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";

export function PeoplePage() {
  const [people, setPeople] = useState<PersonDto[]>([]);

  async function load() {
    setPeople((await api.people.list()).people);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.people.create({
      name: String(form.get("name")),
      email: String(form.get("email")),
    });
    event.currentTarget.reset();
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
            <article className="record-row" key={person.publicId}>
              <strong>{person.name}</strong>
              <span>{person.publicId}</span>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
