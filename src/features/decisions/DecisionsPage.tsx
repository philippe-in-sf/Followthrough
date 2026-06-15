import { type FormEvent, useEffect, useState } from "react";
import type { DecisionDto } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { scrollRecordIntoView } from "../../recordFocus";

type DecisionFormState = {
  publicId: string;
  decisionText: string;
  decisionDate: string;
  context: string;
  meetingPublicId: string;
};

const emptyDecisionForm: DecisionFormState = {
  publicId: "",
  decisionText: "",
  decisionDate: "",
  context: "",
  meetingPublicId: "",
};

export function DecisionsPage({
  focusDecisionPublicId,
  onDecisionFocusHandled,
}: {
  focusDecisionPublicId?: string | null;
  onDecisionFocusHandled?: () => void;
}) {
  const [decisions, setDecisions] = useState<DecisionDto[]>([]);
  const [form, setForm] = useState<DecisionFormState>(emptyDecisionForm);

  async function load() {
    setDecisions((await api.decisions.list()).decisions);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      decisionText: form.decisionText,
      decisionDate: form.decisionDate,
      context: form.context,
      meetingPublicId: form.meetingPublicId || null,
    };

    if (form.publicId) await api.decisions.update(form.publicId, body);
    else await api.decisions.create(body);

    setForm(emptyDecisionForm);
    await load();
  }

  function editDecision(decision: DecisionDto) {
    setForm({
      publicId: decision.publicId,
      decisionText: decision.decisionText,
      decisionDate: decision.decisionDate,
      context: decision.context,
      meetingPublicId: decision.meetingPublicId ?? "",
    });
  }

  useEffect(() => {
    if (!focusDecisionPublicId) return;
    const decision = decisions.find((item) => item.publicId === focusDecisionPublicId);
    if (!decision) return;

    editDecision(decision);
    scrollRecordIntoView(`decision-${decision.publicId}`);
    onDecisionFocusHandled?.();
  }, [decisions, focusDecisionPublicId, onDecisionFocusHandled]);

  return (
    <main className="page">
      <header className="page-header">
        <h2>Decisions</h2>
      </header>
      <form className="editor-form" onSubmit={submitDecision}>
        <FormField label="Decision">
          <input
            value={form.decisionText}
            onChange={(event) => setForm({ ...form, decisionText: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Decision date">
          <input
            type="date"
            value={form.decisionDate}
            onChange={(event) => setForm({ ...form, decisionDate: event.target.value })}
            required
          />
        </FormField>
        <FormField label="Decision context">
          <input
            value={form.context}
            onChange={(event) => setForm({ ...form, context: event.target.value })}
          />
        </FormField>
        <FormField label="Meeting ID">
          <input
            value={form.meetingPublicId}
            onChange={(event) => setForm({ ...form, meetingPublicId: event.target.value })}
            placeholder="M001"
          />
        </FormField>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            {form.publicId ? "Update decision" : "Add decision"}
          </button>
          {form.publicId ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setForm(emptyDecisionForm)}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      {decisions.length === 0 ? (
        <EmptyState title="No decisions" detail="Record decisions from meetings or standalone context." />
      ) : (
        <div className="record-list">
          {decisions.map((decision) => (
            <article
              aria-label={`Decision ${decision.publicId}`}
              className="record-row"
              id={`decision-${decision.publicId}`}
              key={decision.publicId}
            >
              <div>
                <strong>{decision.decisionText}</strong>
                <span>{decision.context}</span>
              </div>
              <span>{decision.publicId}</span>
              <span>{decision.decisionDate}</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => editDecision(decision)}
                aria-label={`Edit ${decision.publicId}`}
              >
                Edit
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
