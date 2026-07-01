# Add Meeting Wizard Design

## Purpose

The current Add meeting form is a single stacked form with conditional fields that appear as the user changes recurrence choices. It technically works, but it does not show how many steps exist or where the user is in the creation flow.

This change keeps meeting creation unified while making the flow explicit:

- A compact Quick Add path for one-time meetings.
- A three-step wizard for full meeting creation.
- One shared submit path behind both flows so behavior does not drift.

## Selected Approach

Use a **Quick Add + Stepper Wizard** layout.

Quick Add stays visible at the top of the active Meetings page and creates one-time meetings only. It supports:

- Meeting title.
- Start date and time.
- Optional attendee names using the existing quick-add parsing rules.

The full Add meeting form becomes a wizard with visible progress:

1. **Basics**
2. **People & Work**
3. **Details**

The wizard is the path for recurring meetings, linked tasks, summaries, blockers, privacy, and Google Calendar import.

## Quick Add Behavior

Quick Add is intentionally narrow.

Required fields:

- Meeting title.
- Meeting start.

Optional fields:

- Attendee names.

Submitting Quick Add creates a one-time meeting through the same client-side creation helper used by the wizard. It must not create or link a meeting series, attach tasks, set privacy, or collect summary/blocker details.

After a successful Quick Add submit:

- The meeting list refreshes.
- The Quick Add fields reset.
- The same success/error pattern used by the existing meeting form is preserved.

## Wizard Steps

### Step 1: Basics

This step establishes what kind of meeting is being created.

Fields:

- Meeting title.
- Meeting start.
- Recurrence mode:
  - One-time meeting.
  - Use existing recurring meeting.
  - Start new recurring meeting.

Conditional fields:

- Existing recurring meeting selector appears only for existing recurring mode.
- New recurring meeting name and cadence appear only for new recurring mode.

Validation:

- Title and start time are required.
- Existing recurring mode requires a selected series.
- New recurring mode requires a series title.
- Cadence remains optional.

### Step 2: People & Work

This step connects the meeting to people and tasks.

Fields:

- Existing attendees from the shared People list.
- Quick-add attendees.
- Linked meeting tasks.

The quick-add attendees field remains available here even though Quick Add also exists above the wizard. Quick Add is for creating a whole one-time meeting quickly; the Step 2 attendee quick-add is for adding people while building a fuller meeting. The label must make that distinction clear.

The stepper must show lightweight counts when possible, such as selected attendee count and linked task count, so users can see whether the step already has content.

### Step 3: Details

This step captures optional meeting context.

Fields:

- Meeting summary.
- Meeting blockers.
- Blockers cleared state if blockers exist.
- Private flag.
- Google Calendar import controls and imported-event preview.

Google Calendar import can populate Basics, People & Work, and Details fields. If an imported event is applied while the wizard is closed or on another step, the wizard must move to Basics and leave the user with visible imported context.

## Navigation

The wizard uses a visible stepper with three labeled steps and a compact progress indicator such as `Step 1 of 3`.

Controls:

- `Next` advances from Basics to People & Work after validating the current step.
- `Back` returns to the previous step without losing entered data.
- `Add meeting` appears on the final step.
- Clicking a completed step in the stepper returns to that step.

The wizard must not hide validation errors on a different step. If final submit finds a validation issue from an earlier step, it must move the user back to that step and show the error there.

## Backend And Data Behavior

The backend API shape does not need to change for this iteration.

The frontend can continue composing existing endpoints:

- `POST /api/meetings` for one-time meetings and first meetings in a newly created series.
- `POST /api/meeting-series` before creating the first meeting in a new series.
- `POST /api/meeting-series/:publicId/occurrences` for occurrences in an existing series.

Existing behavior must be preserved:

- One-time meetings have no series.
- Existing recurring meetings link to an active series.
- Creating an occurrence carries open series tasks and prior applicable context as it does today.
- Attendee names typed into meeting creation create People records using the standardized first/last-name parsing helper.
- Long links remain collapsed in dense labels and selectors.

## UI Structure

The active Meetings page must show:

1. Quick Add one-time meeting row.
2. Full Add meeting wizard, collapsed or open based on the existing add-form affordance.
3. Recurring series reference lane.
4. Meeting records.

The wizard must be compact and operational, not a landing page embedded inside the product. Cards must be used only for the actual form container and repeated records, matching the existing app style.

## Error Handling

Quick Add and the wizard must use the same error state pattern as the existing form.

Expected errors:

- Missing title.
- Missing start time.
- Missing existing series selection.
- Missing new series title.
- API failure while creating a series.
- API failure while creating a meeting or occurrence.
- Attendee quick-add parse errors if the name input cannot produce a usable person.

If a new series is created but the first meeting fails, the user must see the API error. A backend transaction can be considered later, but this iteration can preserve the current two-request flow because the existing app already supports independently created series.

## Testing

Client tests must cover:

- Quick Add creates a one-time meeting from title, start, and attendee names.
- Quick Add does not send recurrence, tasks, summary, blockers, or privacy fields.
- The wizard renders a visible three-step progress indicator.
- Basics validation blocks moving forward when required fields are missing.
- Existing recurring mode requires a selected series and creates an occurrence.
- New recurring mode creates the series and the first meeting.
- People & Work preserves existing attendee selection, quick-add attendees, and task linking.
- Google Calendar import still populates the unified meeting creation state.

Server tests are only needed if the backend API shape changes. If the frontend continues composing existing endpoints, existing server tests should remain the behavioral guardrail.

## Out Of Scope

- Changing the database schema.
- Adding automatic calendar recurrence rules.
- Bulk-generating future recurring occurrences.
- Editing or archiving recurring series from the wizard.
- Replacing the existing meeting-series API.
- Adding advanced task creation inside meeting creation.
