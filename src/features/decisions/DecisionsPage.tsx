import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { DecisionDto, MeetingDto, PersonDto } from "../../../shared/types";
import { api } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { collapseLinks, LinkedText, type RecordReferenceTarget } from "../../components/LinkedText";
import { PaginatedItems } from "../../components/PaginatedItems";
import { scrollRecordIntoView } from "../../recordFocus";

type DecisionFormState = {
  publicId: string;
  decisionText: string;
  decisionDate: string;
  context: string;
  meetingPublicId: string;
  supersededByDecisionPublicId: string;
  createFollowUpTask: boolean;
  followUpTaskDescription: string;
  followUpTaskAssigneePublicId: string;
  followUpTaskDueDate: string;
  followUpTaskPrivate: boolean;
};

const emptyDecisionForm: DecisionFormState = {
  publicId: "",
  decisionText: "",
  decisionDate: "",
  context: "",
  meetingPublicId: "",
  supersededByDecisionPublicId: "",
  createFollowUpTask: false,
  followUpTaskDescription: "",
  followUpTaskAssigneePublicId: "",
  followUpTaskDueDate: "",
  followUpTaskPrivate: false,
};

export function DecisionsPage({
  focusDecisionPublicId,
  onDecisionFocusHandled,
  onRecordReferenceOpen,
}: {
  focusDecisionPublicId?: string | null;
  onDecisionFocusHandled?: () => void;
  onRecordReferenceOpen?: (target: RecordReferenceTarget) => void;
}) {
  const [decisions, setDecisions] = useState<DecisionDto[]>([]);
  const [meetings, setMeetings] = useState<MeetingDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [form, setForm] = useState<DecisionFormState>(emptyDecisionForm);

  async function load() {
    const [decisionResult, meetingResult, peopleResult] = await Promise.all([
      api.decisions.list(),
      api.meetings.list(),
      api.people.list(),
    ]);
    setDecisions(decisionResult.decisions);
    setMeetings(meetingResult.meetings);
    setPeople(peopleResult.people);
  }

  useEffect(() => {
    void load();
  }, []);

  const recentMeetingOptions = useMemo(() => {
    const recentMeetings = [...meetings]
      .sort(
        (left, right) =>
          new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime(),
      )
      .slice(0, 25);
    const selectedMeeting = meetings.find((meeting) => meeting.publicId === form.meetingPublicId);
    const selectedIsVisible = recentMeetings.some(
      (meeting) => meeting.publicId === form.meetingPublicId,
    );

    if (selectedMeeting && !selectedIsVisible) {
      return [selectedMeeting, ...recentMeetings];
    }

    return recentMeetings;
  }, [form.meetingPublicId, meetings]);

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      decisionText: form.decisionText,
      decisionDate: form.decisionDate,
      context: form.context,
      meetingPublicId: form.meetingPublicId || null,
      supersededByDecisionPublicId: form.supersededByDecisionPublicId || null,
      followUpTask: form.createFollowUpTask
        ? {
            description: form.followUpTaskDescription,
            assigneePublicId: form.followUpTaskAssigneePublicId || null,
            dueDate: form.followUpTaskDueDate || null,
            private: form.followUpTaskPrivate,
          }
        : undefined,
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
      supersededByDecisionPublicId: decision.supersededByDecisionPublicId ?? "",
      createFollowUpTask: false,
      followUpTaskDescription: "",
      followUpTaskAssigneePublicId: "",
      followUpTaskDueDate: "",
      followUpTaskPrivate: false,
    });
  }

  useEffect(() => {
    if (!focusDecisionPublicId) return;
    const decision = decisions.find((item) => item.publicId === focusDecisionPublicId);
    if (!decision) return;

    editDecision(decision);
    window.setTimeout(() => scrollRecordIntoView(`decision-${decision.publicId}`), 0);
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
          <select
            value={form.meetingPublicId}
            onChange={(event) => setForm({ ...form, meetingPublicId: event.target.value })}
          >
            <option value="">No meeting</option>
            {form.meetingPublicId &&
            !meetings.some((meeting) => meeting.publicId === form.meetingPublicId) ? (
              <option value={form.meetingPublicId}>
                {form.meetingPublicId} - linked meeting unavailable
              </option>
            ) : null}
            {recentMeetingOptions.map((meeting) => (
              <option key={meeting.publicId} value={meeting.publicId}>
                {meeting.publicId} - {collapseLinks(meeting.title)} -{" "}
                {new Date(meeting.startsAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Superseded by decision">
          <select
            value={form.supersededByDecisionPublicId}
            onChange={(event) =>
              setForm({ ...form, supersededByDecisionPublicId: event.target.value })
            }
          >
            <option value="">Not superseded</option>
            {form.supersededByDecisionPublicId &&
            !decisions.some(
              (decision) => decision.publicId === form.supersededByDecisionPublicId,
            ) ? (
              <option value={form.supersededByDecisionPublicId}>
                {form.supersededByDecisionPublicId} - linked decision unavailable
              </option>
            ) : null}
            {decisions
              .filter((decision) => decision.publicId !== form.publicId)
              .map((decision) => (
                <option key={decision.publicId} value={decision.publicId}>
                  {decision.publicId} - {collapseLinks(decision.decisionText)}
                </option>
              ))}
          </select>
        </FormField>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={form.createFollowUpTask}
            onChange={(event) =>
              setForm({
                ...form,
                createFollowUpTask: event.target.checked,
                followUpTaskDescription: event.target.checked
                  ? form.followUpTaskDescription
                  : "",
                followUpTaskAssigneePublicId: event.target.checked
                  ? form.followUpTaskAssigneePublicId
                  : "",
                followUpTaskDueDate: event.target.checked ? form.followUpTaskDueDate : "",
                followUpTaskPrivate: event.target.checked ? form.followUpTaskPrivate : false,
              })
            }
          />
          <span>Create follow-up task</span>
        </label>
        {form.createFollowUpTask ? (
          <div className="decision-follow-up-fields">
            <FormField label="Follow-up task description">
              <input
                value={form.followUpTaskDescription}
                onChange={(event) =>
                  setForm({ ...form, followUpTaskDescription: event.target.value })
                }
                required
              />
            </FormField>
            <FormField label="Follow-up assignee">
              <select
                value={form.followUpTaskAssigneePublicId}
                onChange={(event) =>
                  setForm({ ...form, followUpTaskAssigneePublicId: event.target.value })
                }
              >
                <option value="">Unassigned</option>
                {people.map((person) => (
                  <option key={person.publicId} value={person.publicId}>
                    {person.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Follow-up due date">
              <input
                type="date"
                value={form.followUpTaskDueDate}
                onChange={(event) =>
                  setForm({ ...form, followUpTaskDueDate: event.target.value })
                }
              />
            </FormField>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={form.followUpTaskPrivate}
                onChange={(event) =>
                  setForm({ ...form, followUpTaskPrivate: event.target.checked })
                }
              />
              <span>Private follow-up task</span>
            </label>
          </div>
        ) : null}
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
        <PaginatedItems
          items={decisions}
          itemName="decision"
          pageSize={10}
          getItemKey={(decision) => decision.publicId}
          focusItemKey={focusDecisionPublicId}
        >
          {(visibleDecisions) => (
            <div className="record-list">
              {visibleDecisions.map((decision) => (
                <article
                  aria-label={`Decision ${decision.publicId}`}
                  className="record-row decision-row"
                  id={`decision-${decision.publicId}`}
                  key={decision.publicId}
                >
                  <div className="decision-row-main">
                    <span className="record-summary-id">
                      <LinkedText text={decision.publicId} onRecordOpen={onRecordReferenceOpen} />
                    </span>
                    <div className="decision-row-copy">
                      <strong>
                        <LinkedText text={decision.decisionText} onRecordOpen={onRecordReferenceOpen} />
                      </strong>
                      {decision.context ? (
                        <span className="record-summary-context">
                          <LinkedText text={decision.context} onRecordOpen={onRecordReferenceOpen} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="decision-row-meta">
                    <span className="decision-row-date">{decision.decisionDate}</span>
                    <div className="decision-task-links">
                      {decision.supersededByDecisionPublicId ? (
                        <span className="hint-chip">
                          Superseded by{" "}
                          <LinkedText
                            text={decision.supersededByDecisionPublicId}
                            onRecordOpen={onRecordReferenceOpen}
                          />
                        </span>
                      ) : null}
                      {decision.tasks.length ? (
                        decision.tasks.map((task) => (
                          <span className="hint-chip" key={task.publicId}>
                            <LinkedText text={`${task.publicId} - ${task.description}`} onRecordOpen={onRecordReferenceOpen} />
                          </span>
                        ))
                      ) : (
                        <span className="muted-text">No spawned tasks</span>
                      )}
                    </div>
                  </div>
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
        </PaginatedItems>
      )}
    </main>
  );
}
