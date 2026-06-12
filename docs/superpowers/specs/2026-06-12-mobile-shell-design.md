# Mobile Shell Design

## Purpose

Improve the app on phone-sized screens by replacing the current crude responsive fallback with a deliberate mobile shell.

The approved direction is option A from the mobile layout mockups: a bottom command bar with a visible current-section summary at the top of the content. Desktop and tablet split-rail behavior should remain unchanged.

## Current Problem

The desktop shell now has a useful split navigation model: a narrow icon rail plus a context rail. On screens below the current mobile breakpoint, the CSS hides the context rail and turns the icon rail into a compact bottom strip. That prevents the left side from looking broken, but it also drops section context and makes the phone layout feel like an afterthought. A miracle of responsive design, if the goal was surrender.

The mobile layout should keep the useful parts of the split rail without wasting phone width.

## Approved Direction

Use a phone-specific shell:

- A compact top bar with the app mark, search, user name, and sign-out control.
- A compact current-section summary at the top of the workspace.
- A fixed bottom command bar for primary section navigation.
- The existing work calendar shortcut in the bottom command area.
- A small visible version label in the bottom command area.

This keeps the app's main content full-width on phones while preserving the orientation value that the context rail provides on desktop.

## Layout

Desktop and wide tablet:

- Keep the current split shell: `72px` icon rail, `200px` context rail, flexible workspace.
- Keep the icon rail sticky on the left.
- Keep the context rail visible.

Narrow tablet:

- Keep the current behavior unless the implementation finds a clear overlap or text-fitting issue.
- The first mobile pass should focus on phone-sized screens, not re-litigate the whole responsive system.

Phone-sized screens:

```text
+--------------------------------+
| topbar: TM, search, user/logout |
+--------------------------------+
| current-section summary         |
| page content                    |
| page content                    |
| page content                    |
+--------------------------------+
| bottom command bar + version    |
+--------------------------------+
```

Recommended breakpoint:

- Keep the existing `max-width: 700px` mobile breakpoint unless browser verification shows it should shift slightly.

## Mobile Top Bar

The mobile top bar should preserve the current topbar functions while fitting phone width:

- App mark: `TM`.
- Search input should remain reachable and full-width when wrapping is needed.
- User name and sign-out stay visible if they fit.
- If the user name crowds the search field, hide or visually compress the name before hiding sign-out.

The sign-out control must remain an icon button with a clear accessible label.

## Mobile Section Summary

Add a mobile-only section summary using the existing `sectionNavigation` metadata:

- Eyebrow: "Current section".
- Section title.
- Section description.
- Context rows for the active section.

The summary replaces the hidden desktop context rail on phones. It should be compact enough to scan quickly and should not turn into another card-heavy dashboard.

Recommended behavior:

- Render the summary above the active page content.
- Use the same labels and descriptions as `ContextRail`.
- Keep rows shallow and non-interactive for this pass.
- Do not add new count APIs for mobile summary rows.

## Bottom Command Bar

The bottom command bar owns primary navigation on phones.

Content:

- Dashboard
- Tasks
- Meetings
- Decisions
- People
- Work calendar shortcut
- Version label

Behavior:

- Section buttons use the existing icons from `sectionNavigation`.
- Active section uses `aria-current="page"` and a visible active state.
- Work calendar remains a link to `https://calendar.google.com` and opens in a new tab.
- The bottom bar is fixed to the viewport bottom and reserves enough page padding so content is not hidden underneath it.

Visual direction:

- Use the same dark neutral surface as the desktop icon rail.
- Use compact square icon buttons with 8px radius.
- Use the existing teal accent sparingly for the app mark or active details.
- Keep labels available through accessible names and tooltips; do not force text labels into the phone bar unless verification shows icons are too ambiguous.

## Component Structure

Keep the desktop components and introduce mobile structure without duplicating navigation metadata.

Recommended component updates:

- `AppShell`
  - Continue to own the active section and shell layout.
  - Render `IconRail` and `ContextRail` for desktop/tablet.
  - Render `MobileSectionSummary` for phone layouts.
- `MobileSectionSummary`
  - New focused component.
  - Reads the active section from props.
  - Uses `sectionNavigation[section]` for title, description, and rows.
- `IconRail`
  - Continue rendering the icon navigation and footer actions.
  - CSS should adapt its mobile presentation into the bottom command bar.
- `shellNavigation`
  - Remains the single source of truth for section labels, icons, descriptions, and context rows.

Do not fork a separate mobile navigation config. That would be a slow way to make the app disagree with itself.

## Data Flow

No new backend data is needed.

Use existing state and props:

- Active section from `AppShell`.
- Section metadata from `shellNavigation`.
- Version from `src/version.ts`.
- Calendar URL from the current `IconRail` link.

The mobile summary should not fetch data, mutate data, or own filter state in this pass.

## Accessibility

- Bottom navigation must be exposed as navigation with an accessible name.
- Icon-only controls need accessible labels.
- Active section needs a non-color-only selected indicator.
- Focus states must be visible on the dark bottom bar.
- The fixed bottom bar must not cover focused controls when tabbing through the page.
- The mobile summary should not duplicate landmarks in a confusing way. Use a `section` or non-landmark container unless testing shows another structure reads better.

## Error Handling

This is a presentational shell change, so there are no new runtime error states.

Defensive behavior:

- If a section is active, the summary renders from the typed `sectionNavigation` map.
- If future sections are added, TypeScript should force metadata to be added before compilation passes.
- The calendar link remains an ordinary external link; failure to load Google Calendar is outside the app.

## Testing

Add focused client coverage for:

- Mobile section summary renders the active section description and rows.
- Bottom command bar exposes accessible section buttons.
- Clicking a bottom command bar button calls `onSectionChange`.
- Work calendar link remains present with the correct href.
- Version remains visible in the mobile shell.

Run the existing client and full test suites:

```bash
npm run check
npm run test
npm run build
```

Browser verification:

- Verify desktop width still shows the split icon rail plus context rail.
- Verify phone width shows the mobile topbar, section summary, bottom command bar, calendar shortcut, and version.
- Check at least one narrow width around `390px` and one small width around `360px`.
- Confirm page content is not hidden behind the fixed bottom bar.

## Out of Scope

- New APIs for context counts.
- A mobile drawer for context rows.
- Reworking page-level forms and record rows beyond avoiding obvious overflow.
- Changing the desktop split rail.
- Replacing the app's visual theme.

## Approval

The user approved option A: bottom command bar with current-section summary.
