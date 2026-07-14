# Record Number Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task and meeting public IDs clickable from list views so users can jump directly to the referenced record.

**Architecture:** Add one reusable `RecordIdLink` button component and a shared `RecordLinkTarget` type. Reuse the existing app focus flow: clicking a `T###` or `M###` record link updates the active section and focus target; the destination page expands and scrolls to the record.

**Tech Stack:** React, TypeScript, existing app state navigation, Vitest/Testing Library.

---

## File Structure

- Create `src/components/RecordIdLink.tsx`: compact accessible public-ID link button.
- Modify `src/App.tsx`: own a generic `openRecord` callback and pass it to pages/shell.
- Modify `src/components/AppShell.tsx`: pass record opening into global search.
- Modify `src/components/GlobalSearch.tsx`: focus task/meeting/decision results instead of only switching section.
- Modify `src/features/tasks/TasksPage.tsx`: render task IDs, origin meeting IDs, and dependency IDs as record links.
- Modify `src/features/meetings/MeetingsPage.tsx`: render meeting IDs and linked task IDs as record links.
- Modify `src/features/people/PeoplePage.tsx`: render related task and meeting IDs as record links.
- Modify `src/features/decisions/DecisionsPage.tsx`: render linked task IDs as record links.
- Modify focused client tests under `tests/client/`.

## Task 1: Shared Record Link Component

**Files:**
- Create: `src/components/RecordIdLink.tsx`

- [ ] **Step 1: Create component**

```tsx
import type { MouseEvent, ReactNode } from "react";

export type RecordLinkTarget = {
  publicId: string;
  type: "task" | "meeting" | "decision";
};

export function RecordIdLink({
  publicId,
  type,
  onOpenRecord,
  children = publicId,
  className = "",
}: {
  publicId: string;
  type: RecordLinkTarget["type"];
  onOpenRecord: (target: RecordLinkTarget) => void;
  children?: ReactNode;
  className?: string;
}) {
  function openRecord(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onOpenRecord({ type, publicId });
  }

  return (
    <button
      aria-label={`Open ${type} ${publicId}`}
      className={`record-id-link${className ? ` ${className}` : ""}`}
      type="button"
      onClick={openRecord}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Add link styles**

Add `.record-id-link` to `src/styles.css` with compact inline-button styling that inherits surrounding typography, uses underline/color for affordance, and keeps focus visible.

## Task 2: App Navigation Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/GlobalSearch.tsx`

- [ ] **Step 1: Use the shared target type**

Import `RecordLinkTarget` in `src/App.tsx`, replace the local dashboard-only target type with it, and map `task`, `meeting`, and `decision` to the existing focusable sections.

- [ ] **Step 2: Pass `onOpenRecord` through the shell and pages**

Add `onOpenRecord` to `AppShell` props and pass it to `GlobalSearch`. Pass the same callback into Tasks, Meetings, People, and Decisions pages.

- [ ] **Step 3: Update global search result clicks**

When a search result type is `task`, `meeting`, or `decision`, call `onOpenRecord({ type, publicId })`. Keep people results using the existing section-only behavior.

## Task 3: List View Record IDs

**Files:**
- Modify: `src/features/tasks/TasksPage.tsx`
- Modify: `src/features/meetings/MeetingsPage.tsx`
- Modify: `src/features/people/PeoplePage.tsx`
- Modify: `src/features/decisions/DecisionsPage.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Add `onOpenRecord` props**

Add an `onOpenRecord: (target: RecordLinkTarget) => void` prop to each page that renders task or meeting IDs as list content.

- [ ] **Step 2: Replace plain public IDs**

Use `<RecordIdLink type="task" publicId={task.publicId} onOpenRecord={onOpenRecord} />` for task IDs and `<RecordIdLink type="meeting" publicId={meeting.publicId} onOpenRecord={onOpenRecord} />` for meeting IDs.

- [ ] **Step 3: Preserve parent interactions**

Keep existing row/card buttons for expansion, but let `RecordIdLink` stop propagation so clicking the ID navigates instead of toggling only the parent row.

## Task 4: Tests And Verification

**Files:**
- Modify: `tests/client/dashboard.test.tsx`
- Modify or add: focused tests under `tests/client/records.test.tsx`

- [ ] **Step 1: Add client behavior tests**

Cover at least:

```tsx
await user.click(screen.getByRole("button", { name: /open meeting M001/i }));
expect(await screen.findByRole("heading", { name: "Meetings" })).toBeInTheDocument();
expect(screen.getByRole("article", { name: /Meeting M001/i })).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: /open task T001/i }));
expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
expect(screen.getByRole("article", { name: /Task T001/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm run test -- tests/client/dashboard.test.tsx tests/client/records.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run check
```

Expected: PASS.

## Self-Review

- Spec coverage: task and meeting IDs in list views become clickable and reuse app focus navigation.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: `RecordLinkTarget` is the shared app/page/search target type.
