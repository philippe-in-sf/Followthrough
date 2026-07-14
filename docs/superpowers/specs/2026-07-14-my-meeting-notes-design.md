# My Meeting Notes Design

## Goal

Add a dedicated Notes section where a signed-in user can review meeting notes from meetings that are personally relevant to them. A meeting is relevant when the user created it or when the user is an attendee, matched by the user's login email to an active People record in the same team.

The first version supports quick ranges for the last day, week, and month, plus a custom date range.

## User Experience

The app adds a top-level Notes navigation item. The Notes page opens with the last week selected, shows range controls, and lists matching meeting notes newest first.

Each note result shows:

- meeting title and public ID
- meeting start date and time
- whether the match came from creator, attendee, or both
- attendee names
- rendered rich meeting notes
- an action to open the meeting detail view

Empty states distinguish between no notes in the selected range and an invalid custom range.

## Backend

Add `GET /api/me/meeting-notes` with query parameters:

- `range=day|week|month|custom`
- `startDate=YYYY-MM-DD`, required for custom
- `endDate=YYYY-MM-DD`, required for custom

The endpoint:

- scopes all reads to the current user's team
- includes meetings created by the current user
- includes meetings where an attendee People record has the current user's email
- excludes archived meetings
- excludes meetings with blank notes
- preserves existing private-meeting visibility rules
- sorts by `starts_at DESC`

The response returns a typed list of note summaries; it does not introduce new storage.

## Frontend

Add:

- a `Notes` app section in shell navigation
- a `MeetingNotesPage` feature component
- API client types and method for the new endpoint

The page should use existing UI idioms: segmented-style range buttons, date inputs for custom mode, rich note rendering through `RichNoteText`, and record-opening through the existing meeting focus flow.

## Error Handling

Invalid range names, malformed custom dates, or a custom start date after the end date return a 400 response. The client displays a compact form error and keeps the previous successful results visible only if they still match the selected controls; otherwise it shows an empty/error state.

## Testing

Use test-first implementation.

Server tests cover:

- notes from meetings created by the current user
- notes from meetings where the user's email matches an attendee
- deduplication when both conditions match
- date filtering for day, week, month, and custom
- exclusion of archived, blank-note, other-team, and inaccessible private meetings

Client tests cover:

- Notes navigation and default load
- changing day/week/month/custom filters
- rendering rich notes and opening a meeting
- invalid custom range feedback
