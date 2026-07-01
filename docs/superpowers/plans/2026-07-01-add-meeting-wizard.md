# Add Meeting Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clunky stacked Add meeting form with a one-time Quick Add row and a visible three-step Add meeting wizard.

**Architecture:** Keep the backend API unchanged and refactor the Meetings page so Quick Add and the wizard share one client-side meeting creation helper. Quick Add maps into a one-time meeting with minimal fields, while the wizard preserves the existing recurrence, task linking, attendee creation, Google Calendar import, and privacy behavior.

**Tech Stack:** React 19, TypeScript, Express API client, Testing Library, Vitest, CSS.

---

## Preflight

The current branch has uncommitted People cleanup work in server, shared, client, and test files. Do not start implementation until that work is either committed or moved into an isolated worktree. The implementation must not stage unrelated People cleanup files unless the execution branch intentionally includes them.

Recommended execution setup:

```bash
git status --short --branch
git switch -c codex/add-meeting-wizard
```

If the working tree is still dirty, use `superpowers:using-git-worktrees` before implementation and start from a clean branch that contains `504e3f9 Document add meeting wizard design`.

## File Structure

- Modify `tests/client/dashboard.test.tsx`
  - Add Quick Add coverage.
  - Update existing recurring and new recurring creation tests to use the wizard steps.
  - Add wizard progress and validation coverage.
  - Add Google Calendar import coverage for wizard state.
- Modify `tests/client/skin-contrast.test.ts`
  - Add dark-skin selector coverage for the new Quick Add and wizard containers.
- Modify `src/features/meetings/MeetingsPage.tsx`
  - Add `QuickMeetingFormState` and `MeetingWizardStep`.
  - Add shared meeting creation helper used by Quick Add and the wizard.
  - Add Quick Add submit flow.
  - Replace the stacked Add meeting form fields with a visible stepper and step-specific panels.
  - Keep edit-meeting behavior unchanged.
- Modify `src/styles.css`
  - Add compact Quick Add row styles.
  - Add stepper, wizard panel, wizard footer, and step summary styles.
  - Add dark-skin overrides for the new surfaces.

No server route, schema, database, or API-client type change is required.

---

### Task 1: Drive Quick Add From Client Tests

**Files:**
- Modify: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Write the failing Quick Add client test**

Add this test near the existing Meetings page tests, before `it("shows meetings and creates a recurring occurrence with carried tasks", async () => { ... })`:

```tsx
  it("creates a one-time meeting from Quick Add without advanced fields", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    await userEvent.type(screen.getByLabelText("Quick add meeting title"), "Quick customer check-in");
    await userEvent.type(screen.getByLabelText("Quick add meeting start"), "2099-08-01T11:30");
    await userEvent.type(screen.getByLabelText("Quick add attendees"), "Morgan Lee, Taylor Park");
    await userEvent.click(screen.getByRole("button", { name: "Quick add meeting" }));

    expect(await screen.findByText("Quick customer check-in")).toBeInTheDocument();
    const quickMeetingCard = await expandMeetingCard("M100");
    expect(within(quickMeetingCard).getByText("Morgan Lee, Taylor Park")).toBeInTheDocument();

    const meetingCreateCall = [...vi.mocked(globalThis.fetch).mock.calls]
      .reverse()
      .find(([input, init]) => String(input) === "/api/meetings" && init?.method === "POST");
    const body = JSON.parse(String(meetingCreateCall?.[1]?.body));

    expect(body).toEqual(
      expect.objectContaining({
        title: "Quick customer check-in",
        meetingType: "single",
        seriesPublicId: null,
        summary: "",
        blockers: "",
        blockersCleared: false,
        notes: "",
        links: [],
        taskPublicIds: [],
        private: false,
      }),
    );
    expect(body.attendeePublicIds).toEqual(["P002", "P003"]);
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/meeting-series" && init?.method === "POST",
        ),
    ).toBe(false);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "creates a one-time meeting from Quick Add"
```

Expected: FAIL because the Quick Add labels and submit path do not exist yet.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add tests/client/dashboard.test.tsx
git commit -m "test: cover meeting quick add"
```

---

### Task 2: Add The Shared Creation Helper And Quick Add UI

**Files:**
- Modify: `src/features/meetings/MeetingsPage.tsx`
- Test: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Add Quick Add state and helper types**

In `src/features/meetings/MeetingsPage.tsx`, below `type RecurrenceMode = "single" | "existing" | "new";`, add:

```ts
type MeetingWizardStep = "basics" | "people" | "details";

type QuickMeetingFormState = {
  title: string;
  startsAt: string;
  attendeeNames: string;
};

type MeetingCreateOptions = {
  calendarDetails?: CalendarImportDetails | null;
  forceSingle?: boolean;
  includeDetails?: boolean;
  includeTasks?: boolean;
};
```

Below `const emptyMeetingForm: MeetingFormState = { ... };`, add:

```ts
const emptyQuickMeetingForm: QuickMeetingFormState = {
  title: "",
  startsAt: "",
  attendeeNames: "",
};
```

Inside `MeetingsPage`, after the existing `meetingForm` state, add:

```ts
  const [quickMeetingForm, setQuickMeetingForm] =
    useState<QuickMeetingFormState>(emptyQuickMeetingForm);
  const [quickMeetingError, setQuickMeetingError] = useState("");
  const [meetingFormError, setMeetingFormError] = useState("");
  const [meetingWizardStep, setMeetingWizardStep] = useState<MeetingWizardStep>("basics");
```

- [ ] **Step 2: Replace `submitMeeting` internals with a shared helper**

Replace the body of the existing `submitMeeting` with a call to a new helper. Keep the function name because tests and form rendering already rely on it.

Add this helper above `submitMeeting`:

```ts
  async function createMeetingFromForm(
    form: MeetingFormState,
    {
      calendarDetails = null,
      forceSingle = false,
      includeDetails = true,
      includeTasks = true,
    }: MeetingCreateOptions = {},
  ) {
    const attendeePublicIds = await resolveAttendeePublicIds(
      form.attendeePublicIds,
      form.attendeeNames,
    );
    const sharedMeetingFields = {
      title: form.title,
      startsAt: toApiDateTime(form.startsAt),
      summary: includeDetails ? form.summary : "",
      blockers: includeDetails ? form.blockers : "",
      blockersCleared: includeDetails ? form.blockersCleared : false,
      notes: includeDetails ? calendarDetails?.notes ?? "" : "",
      links: includeDetails ? calendarDetails?.links ?? [] : [],
      attendeePublicIds,
      taskPublicIds: includeTasks ? form.taskPublicIds : [],
      private: includeDetails ? form.private : false,
    };

    if (!forceSingle && form.recurrenceMode === "existing") {
      await api.series.createOccurrence(form.existingSeriesPublicId, sharedMeetingFields);
      return;
    }

    const seriesPublicId =
      !forceSingle && form.recurrenceMode === "new"
        ? (
            await api.series.create({
              title: form.newSeriesTitle,
              cadenceLabel: form.newSeriesCadenceLabel,
              active: true,
            })
          ).series.publicId
        : null;

    await api.meetings.create({
      ...sharedMeetingFields,
      meetingType: seriesPublicId ? "recurring" : "single",
      seriesPublicId,
    });
  }
```

Then change `submitMeeting` to:

```ts
  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMeetingFormError("");
    try {
      await createMeetingFromForm(meetingForm, { calendarDetails: calendarImportDetails });
      setMeetingForm(emptyMeetingForm);
      setCalendarImportDetails(null);
      setMeetingWizardStep("basics");
      await load();
    } catch (error) {
      setMeetingFormError(error instanceof Error ? error.message : "Meeting could not be created.");
    }
  }
```

- [ ] **Step 3: Add the Quick Add submit handler**

Below `submitMeeting`, add:

```ts
  async function submitQuickMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuickMeetingError("");
    try {
      await createMeetingFromForm(
        {
          ...emptyMeetingForm,
          title: quickMeetingForm.title,
          startsAt: quickMeetingForm.startsAt,
          attendeeNames: quickMeetingForm.attendeeNames,
        },
        {
          forceSingle: true,
          includeDetails: false,
          includeTasks: false,
        },
      );
      setQuickMeetingForm(emptyQuickMeetingForm);
      await load();
    } catch (error) {
      setQuickMeetingError(error instanceof Error ? error.message : "Quick Add meeting failed.");
    }
  }
```

- [ ] **Step 4: Render the Quick Add form above the full Add meeting form**

In the active Meetings page render, after the calendar settings form and before the existing `<form className="editor-form" id="meeting-editor" onSubmit={submitMeeting}>`, insert:

```tsx
      <form className="quick-meeting-form" aria-label="Quick add one-time meeting" onSubmit={submitQuickMeeting}>
        <div className="quick-meeting-heading">
          <h3>Quick add one-time meeting</h3>
          <span>Title, time, attendees</span>
        </div>
        <FormField label="Quick add meeting title">
          <input
            value={quickMeetingForm.title}
            onChange={(event) =>
              setQuickMeetingForm({ ...quickMeetingForm, title: event.target.value })
            }
            required
          />
        </FormField>
        <FormField label="Quick add meeting start">
          <input
            type="datetime-local"
            value={quickMeetingForm.startsAt}
            onChange={(event) =>
              setQuickMeetingForm({ ...quickMeetingForm, startsAt: event.target.value })
            }
            required
          />
        </FormField>
        <FormField label="Quick add attendees">
          <input
            value={quickMeetingForm.attendeeNames}
            onChange={(event) =>
              setQuickMeetingForm({ ...quickMeetingForm, attendeeNames: event.target.value })
            }
            placeholder="Morgan Lee, Taylor Park"
          />
        </FormField>
        <button className="primary-button" type="submit">
          Quick add meeting
        </button>
        {quickMeetingError ? (
          <p className="form-error" role="alert">
            {quickMeetingError}
          </p>
        ) : null}
      </form>
```

- [ ] **Step 5: Show full-form submit errors**

Inside the existing Add meeting form, just before `<div className="form-actions">`, add:

```tsx
        {meetingFormError ? (
          <p className="form-error" role="alert">
            {meetingFormError}
          </p>
        ) : null}
```

- [ ] **Step 6: Run the Quick Add test and verify it passes**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "creates a one-time meeting from Quick Add"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/features/meetings/MeetingsPage.tsx tests/client/dashboard.test.tsx
git commit -m "feat: add meeting quick add"
```

---

### Task 3: Drive The Wizard With Client Tests

**Files:**
- Modify: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Add wizard progress and validation coverage**

Add this test near the Quick Add test:

```tsx
  it("shows meeting wizard progress and validates Basics before moving forward", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));

    expect(screen.getByRole("button", { name: /1 Basics/i })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.queryByLabelText("Meeting tasks")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Recurrence"), "existing");
    await userEvent.click(screen.getByRole("button", { name: "Next: People & Work" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a recurring meeting before continuing.",
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Update the existing recurring occurrence test to use wizard navigation**

In `it("shows meetings and creates a recurring occurrence with carried tasks", async () => { ... })`, keep the setup assertions that are not tied to the task picker. Remove the task-picker assertion block from its current pre-wizard location:

```tsx
    const meetingTaskOptions = screen.getByRole("group", { name: "Meeting tasks" });
    expect(meetingTaskOptions).toHaveTextContent("T004 Do the All Hands deck (Link)");
    expect(meetingTaskOptions).not.toHaveTextContent("https://docs.google.com");
    expect(within(meetingTaskOptions).getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      deckUrl,
    );
```

Then replace the final creation section:

```tsx
    await userEvent.type(screen.getByLabelText("Meeting title"), "Project sync follow-up");
    await userEvent.type(screen.getByLabelText("Meeting start"), "2099-06-16T09:00");
    await userEvent.selectOptions(screen.getByLabelText("Recurrence"), "existing");
    await userEvent.selectOptions(screen.getByLabelText("Existing recurring meeting"), "S001");
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));
```

with:

```tsx
    await userEvent.type(screen.getByLabelText("Meeting title"), "Project sync follow-up");
    await userEvent.type(screen.getByLabelText("Meeting start"), "2099-06-16T09:00");
    await userEvent.selectOptions(screen.getByLabelText("Recurrence"), "existing");
    await userEvent.selectOptions(screen.getByLabelText("Existing recurring meeting"), "S001");
    await userEvent.click(screen.getByRole("button", { name: "Next: People & Work" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    const meetingTaskOptions = screen.getByRole("group", { name: "Meeting tasks" });
    expect(meetingTaskOptions).toHaveTextContent("T004 Do the All Hands deck (Link)");
    expect(meetingTaskOptions).not.toHaveTextContent("https://docs.google.com");
    expect(within(meetingTaskOptions).getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      deckUrl,
    );
    await userEvent.click(screen.getByRole("button", { name: "Next: Details" }));
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));
```

- [ ] **Step 3: Update the new recurring meeting test to use wizard navigation**

In `it("starts a new recurring meeting from the Add meeting form", async () => { ... })`, replace:

```tsx
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));
```

with:

```tsx
    await userEvent.click(screen.getByRole("button", { name: "Next: People & Work" }));
    await userEvent.click(screen.getByRole("button", { name: "Next: Details" }));
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));
```

- [ ] **Step 4: Add People & Work attendee and task preservation coverage**

Add this test near the recurring meeting tests:

```tsx
  it("preserves attendee quick add and linked tasks in the wizard", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    await userEvent.type(screen.getByLabelText("Meeting title"), "Launch work session");
    await userEvent.type(screen.getByLabelText("Meeting start"), "2099-08-02T14:00");
    await userEvent.click(screen.getByRole("button", { name: "Next: People & Work" }));

    await userEvent.click(screen.getByLabelText("Avery"));
    await userEvent.type(screen.getByLabelText("Add attendees while building this meeting"), "Morgan Lee");
    await userEvent.click(screen.getByLabelText(/T004 Do the All Hands deck/i));
    await userEvent.click(screen.getByRole("button", { name: "Next: Details" }));
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));

    expect(await screen.findByText("Launch work session")).toBeInTheDocument();
    const meetingCreateCall = [...vi.mocked(globalThis.fetch).mock.calls]
      .reverse()
      .find(([input, init]) => String(input) === "/api/meetings" && init?.method === "POST");
    const body = JSON.parse(String(meetingCreateCall?.[1]?.body));
    expect(body.attendeePublicIds).toEqual(["P001", "P002"]);
    expect(body.taskPublicIds).toEqual(["T004"]);
  });
```

- [ ] **Step 5: Run the focused wizard tests and verify they fail**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "meeting wizard|recurring occurrence|new recurring|preserves attendee"
```

Expected: FAIL because the form still renders every field at once and lacks wizard navigation controls.

- [ ] **Step 6: Commit the failing tests**

Run:

```bash
git add tests/client/dashboard.test.tsx
git commit -m "test: cover add meeting wizard flow"
```

---

### Task 4: Implement Wizard State, Navigation, And Step Rendering

**Files:**
- Modify: `src/features/meetings/MeetingsPage.tsx`
- Test: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Add wizard metadata and helper functions**

In `src/features/meetings/MeetingsPage.tsx`, below `const emptyQuickMeetingForm`, add:

```ts
const meetingWizardSteps: Array<{ key: MeetingWizardStep; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "people", label: "People & Work" },
  { key: "details", label: "Details" },
];

function meetingWizardStepNumber(step: MeetingWizardStep) {
  return meetingWizardSteps.findIndex((item) => item.key === step) + 1;
}
```

Inside `MeetingsPage`, below `resolveAttendeePublicIds`, add:

```ts
  function selectedAttendeeCount(form: MeetingFormState) {
    return form.attendeePublicIds.length + parsePersonNameList(form.attendeeNames).length;
  }

  function wizardStepSummary(step: MeetingWizardStep) {
    if (step === "basics") {
      return meetingForm.recurrenceMode === "single"
        ? "One-time"
        : meetingForm.recurrenceMode === "existing"
          ? "Existing recurring"
          : "New recurring";
    }
    if (step === "people") {
      return `${countLabel(selectedAttendeeCount(meetingForm), "attendee")}, ${countLabel(
        meetingForm.taskPublicIds.length,
        "task",
      )}`;
    }
    return meetingForm.private ? "Private details" : "Optional details";
  }

  function validateMeetingBasics() {
    if (!meetingForm.title.trim()) return "Enter a meeting title before continuing.";
    if (!meetingForm.startsAt.trim()) return "Enter a meeting start before continuing.";
    if (meetingForm.recurrenceMode === "existing" && !meetingForm.existingSeriesPublicId) {
      return "Choose a recurring meeting before continuing.";
    }
    if (meetingForm.recurrenceMode === "new" && !meetingForm.newSeriesTitle.trim()) {
      return "Enter a recurring meeting name before continuing.";
    }
    return "";
  }

  function goToMeetingWizardStep(step: MeetingWizardStep) {
    if (step !== "basics") {
      const basicsError = validateMeetingBasics();
      if (basicsError) {
        setMeetingFormError(basicsError);
        setMeetingWizardStep("basics");
        return;
      }
    }
    setMeetingFormError("");
    setMeetingWizardStep(step);
  }

  function goToNextMeetingWizardStep() {
    if (meetingWizardStep === "basics") {
      goToMeetingWizardStep("people");
      return;
    }
    if (meetingWizardStep === "people") {
      goToMeetingWizardStep("details");
    }
  }

  function goToPreviousMeetingWizardStep() {
    setMeetingFormError("");
    if (meetingWizardStep === "details") setMeetingWizardStep("people");
    if (meetingWizardStep === "people") setMeetingWizardStep("basics");
  }
```

- [ ] **Step 2: Guard final submit with Basics validation**

At the beginning of `submitMeeting`, after `setMeetingFormError("");`, add:

```ts
    const basicsError = validateMeetingBasics();
    if (basicsError) {
      setMeetingFormError(basicsError);
      setMeetingWizardStep("basics");
      return;
    }
```

- [ ] **Step 3: Replace the current stacked Add meeting fields with step-specific rendering**

Inside the existing `<form className="editor-form" id="meeting-editor" onSubmit={submitMeeting}>`, keep the title row and calendar import panel. After the optional `calendarImportDetails` preview, replace the stacked fields from `<FormField label="Meeting title">` through the `Meeting tasks` `CheckboxGroup` with:

```tsx
        <div className="meeting-wizard-stepper" role="list" aria-label="Add meeting steps">
          {meetingWizardSteps.map((step, index) => (
            <button
              aria-current={meetingWizardStep === step.key ? "step" : undefined}
              className={meetingWizardStep === step.key ? "active" : ""}
              key={step.key}
              type="button"
              onClick={() => goToMeetingWizardStep(step.key)}
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
              <small>{wizardStepSummary(step.key)}</small>
            </button>
          ))}
        </div>
        <div className="meeting-wizard-progress">
          Step {meetingWizardStepNumber(meetingWizardStep)} of {meetingWizardSteps.length}
        </div>

        {meetingWizardStep === "basics" ? (
          <section className="meeting-wizard-panel" aria-label="Meeting basics">
            <FormField label="Meeting title">
              <input
                value={meetingForm.title}
                onChange={(event) => setMeetingForm({ ...meetingForm, title: event.target.value })}
                required
              />
            </FormField>
            <FormField label="Meeting start">
              <input
                type="datetime-local"
                value={meetingForm.startsAt}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, startsAt: event.target.value })
                }
                required
              />
            </FormField>
            <FormField label="Recurrence">
              <select
                value={meetingForm.recurrenceMode}
                onChange={(event) =>
                  setMeetingForm({
                    ...meetingForm,
                    recurrenceMode: event.target.value as RecurrenceMode,
                    existingSeriesPublicId:
                      event.target.value === "existing" ? meetingForm.existingSeriesPublicId : "",
                    newSeriesTitle:
                      event.target.value === "new" ? meetingForm.newSeriesTitle : "",
                    newSeriesCadenceLabel:
                      event.target.value === "new" ? meetingForm.newSeriesCadenceLabel : "",
                  })
                }
              >
                <option value="single">One-time meeting</option>
                <option value="existing">Use existing recurring meeting</option>
                <option value="new">Start new recurring meeting</option>
              </select>
            </FormField>
            {meetingForm.recurrenceMode === "existing" ? (
              <FormField label="Existing recurring meeting">
                <select
                  value={meetingForm.existingSeriesPublicId}
                  onChange={(event) =>
                    setMeetingForm({ ...meetingForm, existingSeriesPublicId: event.target.value })
                  }
                  required
                >
                  <option value="">Choose recurring meeting</option>
                  {series.map((item) => (
                    <option key={item.publicId} value={item.publicId}>
                      {collapseLinks(item.title)}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {meetingForm.recurrenceMode === "new" ? (
              <>
                <FormField label="New recurring meeting name">
                  <input
                    value={meetingForm.newSeriesTitle}
                    onChange={(event) =>
                      setMeetingForm({ ...meetingForm, newSeriesTitle: event.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Cadence">
                  <input
                    value={meetingForm.newSeriesCadenceLabel}
                    onChange={(event) =>
                      setMeetingForm({
                        ...meetingForm,
                        newSeriesCadenceLabel: event.target.value,
                      })
                    }
                    placeholder="Weekly"
                  />
                </FormField>
              </>
            ) : null}
          </section>
        ) : null}

        {meetingWizardStep === "people" ? (
          <section className="meeting-wizard-panel" aria-label="Meeting people and work">
            <CheckboxGroup
              legend="Existing attendees"
              options={people.map((person) => ({ publicId: person.publicId, label: person.name }))}
              selected={meetingForm.attendeePublicIds}
              onChange={(attendeePublicIds) =>
                setMeetingForm({ ...meetingForm, attendeePublicIds })
              }
            />
            <FormField label="Add attendees while building this meeting">
              <input
                value={meetingForm.attendeeNames}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, attendeeNames: event.target.value })
                }
                placeholder="Morgan Lee, Taylor Park"
              />
            </FormField>
            <CheckboxGroup
              legend="Meeting tasks"
              options={tasks.map((task) => ({
                publicId: task.publicId,
                label: taskOptionLabel(task),
              }))}
              selected={meetingForm.taskPublicIds}
              onChange={(taskPublicIds) => setMeetingForm({ ...meetingForm, taskPublicIds })}
            />
          </section>
        ) : null}

        {meetingWizardStep === "details" ? (
          <section className="meeting-wizard-panel" aria-label="Meeting details">
            <FormField label="Meeting summary">
              <textarea
                value={meetingForm.summary}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, summary: event.target.value })
                }
              />
            </FormField>
            <FormField label="Meeting blockers">
              <textarea
                value={meetingForm.blockers}
                onChange={(event) =>
                  setMeetingForm({
                    ...meetingForm,
                    blockers: event.target.value,
                    blockersCleared: event.target.value.trim()
                      ? meetingForm.blockersCleared
                      : false,
                  })
                }
              />
            </FormField>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={meetingForm.blockersCleared}
                disabled={!meetingForm.blockers.trim()}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, blockersCleared: event.target.checked })
                }
              />
              <span>Blocker cleared</span>
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={meetingForm.private}
                onChange={(event) =>
                  setMeetingForm({ ...meetingForm, private: event.target.checked })
                }
              />
              <span>Private</span>
            </label>
          </section>
        ) : null}
```

- [ ] **Step 4: Replace the form actions with wizard navigation**

Replace the existing `<div className="form-actions"> ... </div>` at the bottom of the Add meeting form with:

```tsx
        <div className="meeting-wizard-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={goToPreviousMeetingWizardStep}
            disabled={meetingWizardStep === "basics"}
          >
            Back
          </button>
          {meetingWizardStep === "details" ? (
            <button className="primary-button" type="submit">
              Add meeting
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={goToNextMeetingWizardStep}>
              {meetingWizardStep === "basics" ? "Next: People & Work" : "Next: Details"}
            </button>
          )}
        </div>
```

- [ ] **Step 5: Run the wizard tests and verify they pass**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "meeting wizard|recurring occurrence|new recurring|preserves attendee"
```

Expected: PASS.

- [ ] **Step 6: Run the full client dashboard test**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/features/meetings/MeetingsPage.tsx tests/client/dashboard.test.tsx
git commit -m "feat: add meeting wizard"
```

---

### Task 5: Preserve Google Calendar Import In The Wizard

**Files:**
- Modify: `tests/client/dashboard.test.tsx`
- Modify: `src/features/meetings/MeetingsPage.tsx`

- [ ] **Step 1: Extend the fetch fixture with Google Calendar event search**

In `setupAppFetch`, before the `/api/dashboard` handler, add:

```ts
    if (url.pathname === "/api/google-calendar/events" && method === "GET") {
      return json({
        events: [
          {
            id: "gcal-1",
            title: "Imported planning sync",
            startsAt: "2099-08-03T15:00:00.000Z",
            summary: "Imported agenda",
            notes: "Imported private notes",
            links: [
              {
                label: "Planning deck",
                url: "https://example.com/planning",
                linkType: "agenda",
              },
            ],
            attendeeNames: "Jordan Case",
          },
        ],
      });
    }
```

- [ ] **Step 2: Add a Google Calendar import wizard test**

Add this test near the other Meetings page tests:

```tsx
  it("imports a Google Calendar event into the meeting wizard", async () => {
    setupAppFetch({ googleCalendarConnected: true, googleCalendarEmail: "editor@gmail.com" });
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    await userEvent.type(screen.getByLabelText("Meeting title"), "Temporary meeting");
    await userEvent.type(screen.getByLabelText("Meeting start"), "2099-08-03T09:00");
    await userEvent.click(screen.getByRole("button", { name: "Next: People & Work" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import from Google Calendar" }));
    await userEvent.type(screen.getByLabelText("Which Google Calendar meeting?"), "planning");
    await userEvent.click(screen.getByRole("button", { name: "Find meetings" }));
    await userEvent.click(await screen.findByRole("button", { name: /Imported planning sync/i }));

    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Meeting title")).toHaveValue("Imported planning sync");
    expect(screen.getByLabelText("Meeting start")).toHaveValue("2099-08-03T10:00");
    expect(screen.getByText("Imported from Google Calendar")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next: People & Work" }));
    expect(screen.getByLabelText("Add attendees while building this meeting")).toHaveValue(
      "Jordan Case",
    );
    await userEvent.click(screen.getByRole("button", { name: "Next: Details" }));
    expect(screen.getByLabelText("Meeting summary")).toHaveValue("Imported agenda");
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));

    const meetingCreateCall = [...vi.mocked(globalThis.fetch).mock.calls]
      .reverse()
      .find(([input, init]) => String(input) === "/api/meetings" && init?.method === "POST");
    const body = JSON.parse(String(meetingCreateCall?.[1]?.body));
    expect(body.notes).toBe("Imported private notes");
    expect(body.links).toEqual([
      {
        label: "Planning deck",
        url: "https://example.com/planning",
        linkType: "agenda",
      },
    ]);
  });
```

The expected `Meeting start` value assumes the test environment timezone is America/Chicago. If the test runner uses a different timezone, replace the assertion with:

```tsx
    expect(screen.getByLabelText("Meeting start")).toHaveValue(toDateTimeInputValue("2099-08-03T15:00:00.000Z"));
```

and import `toDateTimeInputValue` from `../../src/features/meetings/dateTime`.

- [ ] **Step 3: Run the focused import test and verify it fails if the wizard step is not reset**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "imports a Google Calendar event into the meeting wizard"
```

Expected before implementation: FAIL if `applyGoogleCalendarEvent` does not move the wizard to Basics or if step-specific fields are not visible.

- [ ] **Step 4: Update `applyGoogleCalendarEvent` to move the wizard to Basics**

In `src/features/meetings/MeetingsPage.tsx`, at the end of `applyGoogleCalendarEvent`, before the closing brace, add:

```ts
    setMeetingWizardStep("basics");
    setMeetingFormError("");
```

- [ ] **Step 5: Run the import test and verify it passes**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "imports a Google Calendar event into the meeting wizard"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/features/meetings/MeetingsPage.tsx tests/client/dashboard.test.tsx
git commit -m "test: preserve calendar import in meeting wizard"
```

---

### Task 6: Add Wizard Styling And Dark-Skin Coverage

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/client/skin-contrast.test.ts`

- [ ] **Step 1: Write the dark-skin selector test first**

In `tests/client/skin-contrast.test.ts`, add:

```ts
  it("keeps quick add and meeting wizard surfaces dark and readable inside skins", () => {
    const css = styles();

    expect(css).toContain(
      ".app-shell[data-skin] .quick-meeting-form,\n.app-shell[data-skin] .meeting-wizard-panel,\n.app-shell[data-skin] .meeting-wizard-stepper button",
    );
    expect(css).toContain(".app-shell[data-skin] .meeting-wizard-stepper button.active");
    expect(css).toContain(".app-shell[data-skin] .quick-meeting-heading span");
    expect(css).toContain(".app-shell[data-skin] .meeting-wizard-progress");
  });
```

- [ ] **Step 2: Run the skin test and verify it fails**

Run:

```bash
npm run test -- tests/client/skin-contrast.test.ts -t "quick add and meeting wizard"
```

Expected: FAIL because the new selectors do not exist yet.

- [ ] **Step 3: Add compact Quick Add and wizard styles**

In `src/styles.css`, after the existing `.calendar-import-preview` block, add:

```css
.quick-meeting-form {
  display: grid;
  grid-template-columns: minmax(180px, 1.1fr) repeat(3, minmax(150px, 1fr)) auto;
  align-items: end;
  gap: 10px;
  margin-bottom: 18px;
  border: 1px solid #c8d0dc;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
}

.quick-meeting-heading {
  display: grid;
  gap: 3px;
}

.quick-meeting-heading h3 {
  margin: 0;
}

.quick-meeting-heading span,
.meeting-wizard-progress {
  color: #5b6475;
  font-size: 0.88rem;
}

.quick-meeting-form .form-error {
  grid-column: 1 / -1;
}

.meeting-wizard-stepper,
.meeting-wizard-progress,
.meeting-wizard-panel,
.meeting-wizard-actions,
.editor-form .form-error {
  grid-column: 1 / -1;
}

.meeting-wizard-stepper {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.meeting-wizard-stepper button {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  align-items: center;
  min-width: 0;
  border: 1px solid #d9dee7;
  border-radius: 8px;
  background: #f8fafc;
  color: #1d2433;
  cursor: pointer;
  padding: 10px;
  text-align: left;
}

.meeting-wizard-stepper button span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 700;
}

.meeting-wizard-stepper button strong,
.meeting-wizard-stepper button small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.meeting-wizard-stepper button small {
  grid-column: 2;
  color: #5b6475;
}

.meeting-wizard-stepper button.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.meeting-wizard-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  align-items: start;
  border: 1px solid #d9dee7;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
}

.meeting-wizard-panel textarea {
  min-height: 92px;
}

.meeting-wizard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 4: Add responsive and dark-skin styles**

Inside the existing `@media (max-width: 700px)` block in `src/styles.css`, add:

```css
  .quick-meeting-form,
  .meeting-wizard-stepper {
    grid-template-columns: 1fr;
  }

  .meeting-wizard-actions {
    justify-content: stretch;
  }

  .meeting-wizard-actions button {
    flex: 1;
  }
```

In the existing dark-skin selector group that includes `.calendar-import-panel`, `.editor-form`, and `.checkbox-group`, add:

```css
.app-shell[data-skin] .quick-meeting-form,
.app-shell[data-skin] .meeting-wizard-panel,
.app-shell[data-skin] .meeting-wizard-stepper button {
  border-color: var(--skin-border);
  background: var(--skin-surface);
  color: var(--skin-text);
}

.app-shell[data-skin] .meeting-wizard-stepper button.active {
  border-color: var(--skin-accent);
  background: var(--skin-surface-raised);
}

.app-shell[data-skin] .quick-meeting-heading span,
.app-shell[data-skin] .meeting-wizard-progress,
.app-shell[data-skin] .meeting-wizard-stepper button small {
  color: var(--skin-muted);
}
```

- [ ] **Step 5: Run the skin test and verify it passes**

Run:

```bash
npm run test -- tests/client/skin-contrast.test.ts -t "quick add and meeting wizard"
```

Expected: PASS.

- [ ] **Step 6: Run the focused dashboard tests again**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "Quick Add|meeting wizard|recurring occurrence|new recurring|calendar event"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/styles.css tests/client/skin-contrast.test.ts tests/client/dashboard.test.tsx src/features/meetings/MeetingsPage.tsx
git commit -m "style: polish meeting wizard"
```

---

### Task 7: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run type checks**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Check for whitespace errors**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Review final changed files**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected modified feature files are limited to:

```text
src/features/meetings/MeetingsPage.tsx
src/styles.css
tests/client/dashboard.test.tsx
tests/client/skin-contrast.test.ts
```

If People cleanup files appear, confirm whether they are intentionally part of the execution branch before staging.

- [ ] **Step 6: Final commit if any verification fixes were needed**

If verification required additional edits, run:

```bash
git add src/features/meetings/MeetingsPage.tsx src/styles.css tests/client/dashboard.test.tsx tests/client/skin-contrast.test.ts
git commit -m "fix: stabilize meeting wizard"
```

If no edits were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: Quick Add, wizard steps, validation, recurring modes, People & Work counts, Google Calendar import, unchanged backend API, dark-skin styling, and testing requirements are covered.
- Scope check: This remains a frontend refactor with client tests and CSS only. No database, server route, or API schema work is included.
- Type consistency: `MeetingWizardStep`, `QuickMeetingFormState`, `MeetingCreateOptions`, `createMeetingFromForm`, and wizard navigation helpers are defined before use.
