# Record Number Links Design

## Decision

Task and meeting public IDs in list views should be actionable links. Use the existing app-level focus flow rather than adding URL routing in this pass: clicking `T###` switches to Tasks and focuses that task; clicking `M###` switches to Meetings and focuses that meeting.

## Scope

Apply the treatment anywhere task or meeting IDs appear as list content, including:

- Dashboard task and meeting lists.
- Tasks page card IDs, origin meeting chips, and dependency chips.
- Meetings page meeting IDs and linked task rows.
- People related-record lists.
- Decision linked task chips.
- Global search results.

Decision IDs and people IDs are not part of this request, though the helper can stay generic enough to support them later.

## UI Behavior

The public ID itself should be the clickable target. It should look like a compact record link, preserve the current surrounding layout, and remain keyboard accessible. Clicks inside expandable summary buttons must not accidentally toggle the parent card; the link should stop propagation before changing sections.

## Architecture

Add a reusable client component for public record ID links. The component accepts a record type, public ID, and an `onOpenRecord` callback. App-level state already supports focusing Tasks, Meetings, and Decisions from the dashboard; extend that navigation callback to the pages that render task and meeting list references.

## Data Flow

No API changes are needed. Existing DTOs already carry task and meeting public IDs. Clicking a record link updates app state to the target section and focused public ID. The target page loads its current list, expands the matching record, scrolls it into view, and clears the focus request.

## Testing

Add or update client tests to cover:

- A task number in a list opens and focuses the task.
- A meeting number in a list opens and focuses the meeting.
- Linked IDs embedded inside expandable rows do not just toggle the parent row.

## Out Of Scope

This change does not add deep-link URLs, browser history integration, or new backend endpoints.
