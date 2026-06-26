# Unified Meeting Series Design

## Purpose

The Meetings page currently exposes three creation concepts: create a meeting series, create the next occurrence, and add a meeting with a single/recurring type selector. That makes users understand the database model before they can schedule a meeting.

This change makes **Add meeting** the only creation workflow. Meeting series remain a data concept, but the UI treats them as recurrence context inside meeting creation instead of a separate scheduling surface.

## User Experience

The Meetings page has one primary creation form, **Add meeting**.

The form includes the existing meeting fields:

- Title
- Start date and time
- Summary
- Blockers
- Attendees from People plus new attendee names
- Linked tasks
- Privacy
- Google Calendar import

The form adds a recurrence selector with three choices:

- **One-time meeting**
- **Use existing recurring meeting**
- **Start new recurring meeting**

When **One-time meeting** is selected, no series fields appear.

When **Use existing recurring meeting** is selected, the form shows a required existing recurring meeting selector. Submitting creates the next occurrence for that series and carries open series tasks into the new meeting.

When **Start new recurring meeting** is selected, the form shows required series title and optional cadence fields. Submitting creates the new series and immediately creates the first meeting occurrence from the same form.

The standalone **Meeting series** and **Next occurrence** forms are removed from the top of the page.

## Series Reference Area

The existing recurring series lane stays on the Meetings page, but it is no longer a scheduling form. It is a compact reference area for active recurring meetings.

For this iteration, it lists:

- Series title
- Series public ID
- Cadence label, falling back to `Recurring`

Series edit/archive controls can be added later, but they are not part of this simplification unless required by implementation constraints.

## Backend Behavior

Existing behavior must be preserved:

- One-time meetings have no series.
- Existing recurring meetings must link to an active series.
- Creating a recurring occurrence carries open, non-archived, non-`Done` series tasks into the new meeting.
- Carried notes and structured links from the latest earlier series meeting are merged into the new occurrence.
- Attendee names typed into the meeting form create People records as they do today.
- Google Calendar import can populate the unified meeting form.

The implementation can keep the current API endpoints if that is lower risk:

- `POST /api/meetings` for one-time meetings and first meetings in a newly created series.
- `POST /api/meeting-series` to create the series before the first meeting.
- `POST /api/meeting-series/:publicId/occurrences` for occurrences in an existing series.

The frontend should hide that distinction behind one submit handler.

## Validation And Error Handling

The submit button should create exactly one meeting in every mode.

Validation rules:

- Title and start time are always required.
- Existing recurring mode requires a selected series.
- New recurring mode requires a new series title.
- Cadence remains optional.
- One-time mode must not send a series public ID.

If series creation succeeds but meeting creation fails, the user should see the API error. The implementation should prefer a backend transaction if the API shape changes, but can accept the current two-request frontend flow for this iteration because the app already supports independently created series.

## Testing

Add or update client tests to prove:

- The Meetings page no longer shows separate `Add series` and `Create occurrence` workflows.
- Creating a meeting from an existing recurring series uses the unified Add meeting form and shows carried tasks on the new meeting.
- Starting a new recurring meeting from the unified form creates the series and the first meeting.

Add or update server tests only if the backend API shape changes. If the frontend continues composing existing endpoints, existing carry-over server tests should remain the behavioral guardrail.

## Out Of Scope

- Automatic calendar recurrence rules.
- Editing or archiving series from the compact series lane.
- Bulk generation of future occurrences.
- Changing task carry-over semantics.
- Replacing the underlying `meeting_series` table.
