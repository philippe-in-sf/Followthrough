# Project-centered workspace

## Decision

Followthrough will add projects as an organizational layer without replacing meetings,
calendar import, or the existing meeting-notes document. Calendar integrations create
meeting records; meetings preserve the source context; projects collect ongoing work
across meetings.

The project-centered experience remains opt-in until a separate pilot decision is made.

## Behavioral contract

- Projects are team-scoped and may be active, on hold, completed, or archived.
- A meeting may discuss zero, one, or many projects.
- A project note belongs to one meeting and may be assigned to one or many projects.
- Project notes may remain unassigned so classification never blocks live capture.
- Project notes have a type: note, decision, question, or action.
- Tasks and decisions may be linked to projects independently of their source meeting.
- Existing `meetings.notes` content remains intact and editable as general meeting notes.
- Project notes retain their source meeting, creation time, and author.
- Private-record visibility is inherited from the source meeting when project activity is read.
- Calendar imports preserve an exact time. Manually created meetings require a date but
  may omit the time.

## Two-way-door rules

- `PROJECTS_ENABLED=false` disables project APIs and navigation without deleting data.
- Each user chooses a Classic or Projects workspace; Classic remains the default during
  the pilot period.
- Schema changes are append-only. Rollback does not reverse migrations or drop tables.
- Existing meeting APIs and the general notes field retain their current behavior.
- `npm run projects:flatten-notes` copies project notes into general meeting notes using
  stable markers. The operation is idempotent and leaves normalized project data intact.
- A JSON or Markdown project export is available before any project UI is disabled.

## Rollout boundary

This implementation delivers the architecture, capture and retrieval UI, workspace
switch, and rollback tooling. It deliberately stops before making Projects the default
or evaluating the pilot.
