# Split Icon + Context Rail Design

## Purpose

Replace the current plain text sidebar with a two-part left rail that feels intentional and helps users orient themselves while preserving the app's compact work surface.

The chosen direction is the "Split Icon + Context Rail" mockup: a narrow permanent icon rail plus a contextual panel that changes with the selected section.

## Current Problem

The existing sidebar is a dark block containing five stacked text buttons and a version label. It is functional, but visually lazy: it consumes a full rail width without adding hierarchy, section context, status, or a clear product-shell identity.

The redesign should make the left side do useful interface work without turning the app into a decorative dashboard. The task list, forms, filters, and row density should remain practical.

## Design Principles

- Keep navigation persistent and predictable.
- Separate global navigation from section-specific context.
- Make the rail visually distinctive without stealing attention from the main task surface.
- Avoid deep nested navigation. If a section needs deeper controls, use page-level tabs or filters rather than burying them inside the rail.
- Preserve fast scanning on desktop and avoid cramped text on mobile.

These principles align with product-shell guidance such as IBM Carbon's left-panel model, where persistent shell navigation is treated as a stable product-level pattern and deeper hierarchy is intentionally limited.

Reference: https://carbondesignsystem.com/components/UI-shell-left-panel/usage/

## Layout

Desktop shell:

```text
+----------+--------------------+-------------------------------+
| icon rail | contextual panel   | topbar + active page content  |
| 72px      | 200px              | minmax(0, 1fr)                |
+----------+--------------------+-------------------------------+
```

The icon rail is always visible on authenticated desktop views. The context panel is also visible on desktop and updates when the user changes sections.

Recommended dimensions:

- Icon rail: `72px`.
- Context panel: `200px`, with room to adjust between `180px` and `220px` after implementation review.
- Main content: unchanged flexible workspace.
- Cards, forms, task lanes, and record rows should keep their current density.

## Icon Rail

The icon rail owns global app navigation.

Content:

- App mark at top, such as `TM`.
- One icon button per section:
  - Dashboard
  - Tasks
  - Meetings
  - Decisions
  - People
- Version number at bottom.

Behavior:

- Clicking an icon changes the active section.
- Active section uses a clear filled or high-contrast active state.
- Hover and focus states must be visible.
- Each icon button must have an accessible label, because single-letter icons are not a navigation strategy, they are a cry for help unless labeled properly.

Icon recommendation:

- Use `lucide-react`, already present in the project.
- Suggested icons:
  - Dashboard: `LayoutDashboard`
  - Tasks: `ListTodo`
  - Meetings: `CalendarDays`
  - Decisions: `BadgeCheck` or `GitPullRequestArrow`
  - People: `Users`
  - Sign out remains in the topbar with the existing `LogOut` icon.

## Context Panel

The context panel explains the selected section and exposes lightweight, useful shortcuts.

It should not become a second full navigation tree. Keep it shallow:

- Section title.
- One-sentence section description.
- A small set of context rows, counts, or filter shortcuts.

Initial context content:

### Dashboard

- Description: "Today's operational picture, task pressure, and recent activity."
- Rows:
  - Overdue count.
  - Due soon count.
  - Open by person count.
  - Recent meetings count.

### Tasks

- Description: "Track open work, owners, due dates, and blocked items."
- Rows:
  - Overdue.
  - Due soon.
  - Active.
  - Done.

In the first implementation, task context rows should be static section shortcuts unless they can reuse existing in-page filter state without adding new data flow. Click-to-filter behavior can be added later.

### Meetings

- Description: "Capture meetings, attendees, linked tasks, and recurring series."
- Rows:
  - Recent meetings.
  - Recurring series.
  - Meetings with open tasks.

### Decisions

- Description: "Find recorded decisions and the meeting context behind them."
- Rows:
  - Recent decisions.
  - Linked to meetings.

### People

- Description: "Shared list of assignees and meeting attendees."
- Rows:
  - Total people.
  - People with open tasks.
  - People in recent meetings.

Count badges should appear only when the needed value is already available through existing data loaded by the active page or an existing endpoint. If a value is not already cheap to obtain, omit the badge rather than adding backend work for decorative numbers in the first pass.

## Visual Direction

Use the selected mockup's crisp neutral direction:

- Icon rail: deep neutral ink background.
- Active icon: light filled surface or teal-accented state.
- Context panel: white or very light neutral surface with subtle border.
- Main workspace: current light gray background.
- Primary accent: teal.
- Status accents: keep semantic red, amber, blue, green.

Avoid a one-note palette. The app can use teal as a product accent, but task alert colors must remain semantically distinct.

## Responsive Behavior

Desktop and wide tablet:

- Show icon rail and context panel.

Narrow tablet:

- Keep icon rail visible.
- Collapse the context panel behind a disclosure button or hide it if viewport width cannot support it without crowding content.

Mobile:

- Replace the split rail with compact top navigation or a menu button.
- Do not render a 72px rail beside mobile content; horizontal space is not spare inventory.
- Version can move into the mobile menu footer.

## Component Structure

Recommended component split:

- `AppShell`
  - owns the shell grid and passes active section to rail components.
- `IconRail`
  - renders app mark, section icon buttons, and version.
- `ContextRail`
  - renders selected-section context from a small configuration object.
- `Topbar`
  - optional extraction if `AppShell` becomes cluttered.

Keep section metadata in one local config structure, for example:

```ts
const sectionNavigation = {
  Dashboard: {
    icon: LayoutDashboard,
    description: "Today's operational picture, task pressure, and recent activity.",
  },
  Tasks: {
    icon: ListTodo,
    description: "Track open work, owners, due dates, and blocked items.",
  },
};
```

This avoids scattering labels, icons, descriptions, and aria text across markup.

## Data and Scope

The first implementation should be mostly presentational:

- Use existing active section state.
- Use existing version value.
- Use static section descriptions.
- Use context row labels everywhere.
- Add count badges only where existing loaded data or existing endpoints provide them cheaply.

Do not add new APIs solely for context-panel counts in the first pass. The redesign should improve navigation and visual structure before inventing more data plumbing.

## Accessibility

- Icon-only navigation buttons need `aria-label`.
- Active section should use `aria-current="page"` or an equivalent selected-state announcement.
- Focus states must be visible on both dark and light rail surfaces.
- Context rows that are clickable must be buttons, not inert divs with click handlers.
- Color cannot be the only active indicator.
- Mobile collapsed navigation must remain keyboard accessible.

## Testing

Add focused client tests for:

- Authenticated shell renders the icon rail.
- Each navigation item has an accessible name.
- Active section is indicated accessibly.
- Version remains visible somewhere in the authenticated shell.
- Clicking section navigation still changes pages.

Visual verification:

- Browser check at desktop width to confirm icon rail, context panel, and topbar do not overlap.
- Browser check at mobile width to confirm navigation collapses cleanly and text does not overflow.

Existing verification remains:

```bash
npm run check
npm run test
npm run build
```

## Non-Goals

- Redesigning task cards, forms, or record lanes beyond minor spacing needed to fit the new shell.
- Adding user-customizable themes.
- Adding new backend summary endpoints for rail counts.
- Introducing nested navigation deeper than one contextual panel.
- Changing authentication or routing behavior.
