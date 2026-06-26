# Unified Meeting Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate meeting-series and next-occurrence creation forms with one recurrence-aware Add meeting workflow.

**Architecture:** Keep the existing backend endpoints, but extend the occurrence endpoint so the unified form can pass selected task links without losing carry-over behavior. The React page owns the recurrence mode and composes existing API calls: one-time meeting creation, existing-series occurrence creation, or new-series creation followed by first meeting creation.

**Tech Stack:** React 19, TypeScript, Express, SQLite, Zod, Vitest, Testing Library.

---

## File Structure

- Modify `server/meetings/routes.ts`
  - Add `taskPublicIds` to `occurrenceSchema`.
  - Pass selected task IDs into `replaceMeetingLinks` before carrying existing open series tasks.
- Modify `src/api/client.ts`
  - Add optional `taskPublicIds` to `OccurrenceInput`.
- Modify `src/features/meetings/MeetingsPage.tsx`
  - Replace separate `SeriesFormState` and `OccurrenceFormState` with fields on `MeetingFormState`.
  - Remove `submitSeries`, `submitOccurrence`, and the top `meeting-tools-grid` forms.
  - Add recurrence mode controls inside the Add meeting form.
  - Update `submitMeeting` to dispatch one-time, existing recurring, and new recurring flows.
- Modify `tests/server/meetings.test.ts`
  - Prove the occurrence endpoint accepts explicit task IDs and still carries open series tasks.
- Modify `tests/client/dashboard.test.tsx`
  - Prove the separate creation forms are gone.
  - Prove an existing recurring occurrence is created from the unified Add meeting form.
  - Prove starting a new recurring meeting creates the new series and first meeting.

---

### Task 1: Extend Occurrence API To Preserve Selected Tasks

**Files:**
- Modify: `server/meetings/routes.ts`
- Modify: `src/api/client.ts`
- Test: `tests/server/meetings.test.ts`

- [ ] **Step 1: Write the failing server test**

Add a selected standalone task before creating the next occurrence, send `taskPublicIds` to the occurrence endpoint, and assert the new meeting contains both the explicitly selected task and the carried open series task.

In `tests/server/meetings.test.ts`, inside `it("creates next recurring occurrence and carries open tasks", async () => { ... })`, after the two existing task creation calls and before `const next = await request(app)`, add:

```ts
    const selectedTask = await request(app).post("/api/tasks").set("Cookie", cookie).send({
      description: "Bring metrics dashboard",
      assigneePublicId: personPublicId,
      status: "Open",
      dueDate: "2026-06-16",
    });
```

Then change the occurrence request body to include:

```ts
        taskPublicIds: [selectedTask.body.task.publicId],
```

Then change the task assertion to:

```ts
    expect(next.body.meeting.tasks.map((task: { publicId: string }) => task.publicId)).toEqual([
      "T001",
      "T003",
    ]);
```

- [ ] **Step 2: Run the focused server test and verify it fails**

Run:

```bash
npm run test -- tests/server/meetings.test.ts -t "creates next recurring occurrence and carries open tasks"
```

Expected: FAIL because the explicitly selected task is not linked to the occurrence.

- [ ] **Step 3: Implement the API extension**

In `server/meetings/routes.ts`, update `occurrenceSchema`:

```ts
const occurrenceSchema = z.object({
  title: z.string().trim().optional().or(z.literal("")),
  startsAt: z.string().datetime(),
  summary: z.string().trim().default(""),
  blockers: z.string().trim().default(""),
  blockersCleared: z.boolean().default(false),
  notes: z.string().default(""),
  links: z.array(meetingLinkInputSchema).default([]),
  attendeePublicIds: z.array(publicIdSchema).default([]),
  taskPublicIds: z.array(publicIdSchema).default([]),
  private: z.boolean().default(false),
});
```

In the `seriesRouter.post("/:publicId/occurrences"` handler, replace:

```ts
        replaceMeetingLinks(db, row.id, input.attendeePublicIds, [], series.id, userId, teamId);
```

with:

```ts
        replaceMeetingLinks(
          db,
          row.id,
          input.attendeePublicIds,
          input.taskPublicIds,
          series.id,
          userId,
          teamId,
        );
```

In `src/api/client.ts`, update `OccurrenceInput`:

```ts
type OccurrenceInput = {
  title?: string;
  startsAt: string;
  summary: string;
  blockers?: string;
  blockersCleared?: boolean;
  notes?: string;
  links?: MeetingLinkInput[];
  attendeePublicIds: string[];
  taskPublicIds?: string[];
  private?: boolean;
};
```

- [ ] **Step 4: Run the focused server test and verify it passes**

Run:

```bash
npm run test -- tests/server/meetings.test.ts -t "creates next recurring occurrence and carries open tasks"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/meetings/routes.ts src/api/client.ts tests/server/meetings.test.ts
git commit -m "feat: allow occurrence task links"
```

---

### Task 2: Drive The Unified Add Meeting UI From Client Tests

**Files:**
- Modify: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Update the existing recurring occurrence client test first**

In `tests/client/dashboard.test.tsx`, update `it("shows meetings and creates a recurring occurrence with carried tasks", async () => { ... })`.

Add assertions after navigating to Meetings:

```ts
    expect(screen.queryByRole("button", { name: "Add series" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create occurrence" })).not.toBeInTheDocument();
```

Replace the old occurrence controls:

```ts
    await userEvent.selectOptions(screen.getByLabelText("Occurrence series"), "S001");
    await userEvent.type(screen.getByLabelText("Occurrence start"), "2099-06-16T09:00");
    await userEvent.type(screen.getByLabelText("Occurrence title"), "Project sync follow-up");
    await userEvent.click(screen.getByRole("button", { name: "Create occurrence" }));
```

with unified form usage:

```ts
    await userEvent.type(screen.getByLabelText("Meeting title"), "Project sync follow-up");
    await userEvent.type(screen.getByLabelText("Meeting start"), "2099-06-16T09:00");
    await userEvent.selectOptions(screen.getByLabelText("Recurrence"), "existing");
    await userEvent.selectOptions(screen.getByLabelText("Existing recurring meeting"), "S001");
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));
```

- [ ] **Step 2: Add a client test for starting a new recurring meeting**

Add this test near the existing Meetings page tests:

```tsx
  it("starts a new recurring meeting from the Add meeting form", async () => {
    setupAppFetch();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Meetings" }));
    await userEvent.type(screen.getByLabelText("Meeting title"), "Customer standup kickoff");
    await userEvent.type(screen.getByLabelText("Meeting start"), "2099-07-01T10:00");
    await userEvent.selectOptions(screen.getByLabelText("Recurrence"), "new");
    await userEvent.type(screen.getByLabelText("New recurring meeting name"), "Customer standup");
    await userEvent.type(screen.getByLabelText("Cadence"), "Weekly");
    await userEvent.click(screen.getByRole("button", { name: "Add meeting" }));

    expect(await screen.findByText("Customer standup kickoff")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Recurring series" })).getByText(
        "Customer standup",
      ),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the focused client tests and verify they fail**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "recurring"
```

Expected: FAIL because the old occurrence controls still exist and the new recurrence controls do not.

- [ ] **Step 4: Commit only the failing tests**

Run:

```bash
git add tests/client/dashboard.test.tsx
git commit -m "test: specify unified meeting series flow"
```

---

### Task 3: Implement Unified Meeting Creation UI

**Files:**
- Modify: `src/features/meetings/MeetingsPage.tsx`
- Test: `tests/client/dashboard.test.tsx`

- [ ] **Step 1: Update meeting form types and initial state**

In `src/features/meetings/MeetingsPage.tsx`, add:

```ts
type RecurrenceMode = "single" | "existing" | "new";
```

Update `MeetingFormState` by replacing:

```ts
  meetingType: MeetingType;
  seriesPublicId: string;
```

with:

```ts
  recurrenceMode: RecurrenceMode;
  existingSeriesPublicId: string;
  newSeriesTitle: string;
  newSeriesCadenceLabel: string;
```

Update `emptyMeetingForm` by replacing:

```ts
  meetingType: "single",
  seriesPublicId: "",
```

with:

```ts
  recurrenceMode: "single",
  existingSeriesPublicId: "",
  newSeriesTitle: "",
  newSeriesCadenceLabel: "",
```

Leave `meetingEditForm` on `MeetingFormState` for now by mapping existing meeting edit data into these fields:

```ts
      recurrenceMode: meeting.meetingType === "recurring" ? "existing" : "single",
      existingSeriesPublicId: meeting.seriesPublicId ?? "",
      newSeriesTitle: "",
      newSeriesCadenceLabel: "",
```

- [ ] **Step 2: Remove standalone series and occurrence state**

Remove these types and constants:

```ts
type SeriesFormState = {
  title: string;
  cadenceLabel: string;
  active: boolean;
};

type OccurrenceFormState = {
  seriesPublicId: string;
  startsAt: string;
  title: string;
  summary: string;
  blockers: string;
  blockersCleared: boolean;
  attendeePublicIds: string[];
  attendeeNames: string;
  private: boolean;
};

const emptySeriesForm: SeriesFormState = {
  title: "",
  cadenceLabel: "",
  active: true,
};

const emptyOccurrenceForm: OccurrenceFormState = {
  seriesPublicId: "",
  startsAt: "",
  title: "",
  summary: "",
  blockers: "",
  blockersCleared: false,
  attendeePublicIds: [],
  attendeeNames: "",
  private: false,
};
```

Remove these state hooks:

```ts
  const [seriesForm, setSeriesForm] = useState<SeriesFormState>(emptySeriesForm);
  const [occurrenceForm, setOccurrenceForm] =
    useState<OccurrenceFormState>(emptyOccurrenceForm);
```

- [ ] **Step 3: Replace submit handlers with recurrence-aware submit**

Delete `submitSeries` and `submitOccurrence`.

Update `submitMeeting` so it builds shared fields and dispatches by recurrence mode:

```ts
  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attendeePublicIds = await resolveAttendeePublicIds(
      meetingForm.attendeePublicIds,
      meetingForm.attendeeNames,
    );
    const sharedMeetingFields = {
      title: meetingForm.title,
      startsAt: toApiDateTime(meetingForm.startsAt),
      summary: meetingForm.summary,
      blockers: meetingForm.blockers,
      blockersCleared: meetingForm.blockersCleared,
      notes: calendarImportDetails?.notes ?? "",
      links: calendarImportDetails?.links ?? [],
      attendeePublicIds,
      taskPublicIds: meetingForm.taskPublicIds,
      private: meetingForm.private,
    };

    if (meetingForm.recurrenceMode === "existing") {
      await api.series.createOccurrence(meetingForm.existingSeriesPublicId, sharedMeetingFields);
    } else {
      const seriesPublicId =
        meetingForm.recurrenceMode === "new"
          ? (
              await api.series.create({
                title: meetingForm.newSeriesTitle,
                cadenceLabel: meetingForm.newSeriesCadenceLabel,
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

    setMeetingForm(emptyMeetingForm);
    setCalendarImportDetails(null);
    await load();
  }
```

- [ ] **Step 4: Preserve Google Calendar import as a one-time meeting default**

In `applyGoogleCalendarEvent`, replace:

```ts
      meetingType: "single",
      seriesPublicId: "",
```

with:

```ts
      recurrenceMode: "single",
      existingSeriesPublicId: "",
      newSeriesTitle: "",
      newSeriesCadenceLabel: "",
```

- [ ] **Step 5: Replace the top standalone forms with fields inside Add meeting**

Remove the entire `meeting-tools-grid` block containing the `Meeting series` and `Next occurrence` forms.

Replace the existing `Meeting type` and `Meeting series` fields inside the Add meeting form with:

```tsx
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
```

- [ ] **Step 6: Keep edit meeting behavior compiling**

In `submitMeetingEdit`, derive the current edit API fields from `meetingEditForm.recurrenceMode` and `meetingEditForm.existingSeriesPublicId`:

```ts
      meetingType: meetingEditForm.recurrenceMode === "existing" ? "recurring" : "single",
      seriesPublicId:
        meetingEditForm.recurrenceMode === "existing"
          ? meetingEditForm.existingSeriesPublicId || null
          : null,
```

In the edit form JSX, leave labels as `Meeting type` and `Meeting series for ...` if desired, but bind to `meetingEditForm.recurrenceMode` / `meetingEditForm.existingSeriesPublicId` rather than removed fields.

- [ ] **Step 7: Run the focused client tests and verify they pass**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx -t "recurring"
```

Expected: PASS.

- [ ] **Step 8: Run TypeScript check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/features/meetings/MeetingsPage.tsx tests/client/dashboard.test.tsx
git commit -m "feat: unify meeting series creation"
```

---

### Task 4: Final Verification

**Files:**
- No code edits expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run check
npm run test
npm run build
```

Expected:

- TypeScript check exits `0`.
- Vitest exits `0`.
- Production build exits `0`.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git status --short
git diff --stat origin/main...HEAD
```

Expected:

- Only the known untracked `deploy/com.philippe.web-ui-task-manager.plist` remains outside commits.
- Diff includes the design doc, plan doc, meeting route/API changes, Meetings page changes, and tests.

- [ ] **Step 3: Commit plan if it was not already committed**

Run:

```bash
git add docs/superpowers/plans/2026-06-26-unified-meeting-series.md
git commit -m "docs: add unified meeting series plan"
```

If the plan was already committed before implementation, skip this step.
