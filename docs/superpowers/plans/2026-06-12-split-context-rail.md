# Split Context Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain left sidebar with a split icon rail plus context panel while preserving the current dense task-manager workspace.

**Architecture:** Move section metadata into a focused navigation config, render global section switching through an icon-only rail, and render section descriptions/rows through a separate context rail. `AppShell` remains the shell owner, while the main pages remain mostly unchanged.

**Tech Stack:** React 19, TypeScript, Vite, lucide-react icons, Vitest, Testing Library, CSS media queries.

---

## Prerequisite

This plan assumes the visible-version work from PR #4 is already present in the implementation branch:

- `src/version.ts` exists.
- `App` imports `appVersion`.
- `AppShell` accepts a `version` prop.
- Authenticated shell tests already expect `Version 1.0.1`.

If those files are not present, stop and merge or rebase after PR #4 before executing this rail plan. Do not duplicate the version feature in this PR unless PR #4 is abandoned.

Verification command:

```bash
test -f src/version.ts && rg -n "version:" src/components/AppShell.tsx src/App.tsx tests/client/auth-shell.test.tsx
```

Expected: output shows `src/version.ts` exists and the shell receives/renders a `version` prop.

## File Structure

- Create `src/components/shellNavigation.tsx`
  - Owns ordered section metadata: labels, icons, descriptions, and context rows.
  - Exports `navItems`, `AppSection`, and `sectionNavigation`.
- Create `src/components/IconRail.tsx`
  - Renders the permanent icon rail, app mark, accessible section buttons, and version.
- Create `src/components/ContextRail.tsx`
  - Renders selected-section title, description, and shallow context rows.
- Modify `src/components/AppShell.tsx`
  - Replaces the current `.sidebar` markup with `IconRail` and `ContextRail`.
  - Re-exports `AppSection` so existing imports keep working.
- Modify `src/styles.css`
  - Replaces old sidebar layout styles with split rail styles and responsive behavior.
- Create `tests/client/app-shell.test.tsx`
  - Tests shell accessibility and rail navigation in isolation.
- Modify `tests/client/auth-shell.test.tsx`
  - Keep the existing authenticated app smoke test aligned with the new shell.

---

### Task 1: Add Failing Shell Rail Tests

**Files:**
- Create: `tests/client/app-shell.test.tsx`
- Modify: `tests/client/auth-shell.test.tsx`

- [ ] **Step 1: Create focused `AppShell` tests**

Create `tests/client/app-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell, type AppSection } from "../../src/components/AppShell";

const user = { id: 1, name: "Editor", email: "editor@example.com" };

function renderShell(section: AppSection = "Dashboard") {
  const onSectionChange = vi.fn();
  const onLogout = vi.fn();

  render(
    <AppShell
      user={user}
      section={section}
      onSectionChange={onSectionChange}
      onLogout={onLogout}
      version="1.0.1"
    >
      <main>
        <h2>{section} content</h2>
      </main>
    </AppShell>,
  );

  return { onSectionChange, onLogout };
}

describe("AppShell split context rail", () => {
  it("renders accessible icon navigation and selected-section context", () => {
    renderShell("Dashboard");

    expect(screen.getByLabelText("Task Manager")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Tasks" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Today's operational picture, task pressure, and recent activity.")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Due soon")).toBeInTheDocument();
    expect(screen.getByText("Version 1.0.1")).toBeInTheDocument();
  });

  it("switches sections from the icon rail", async () => {
    const { onSectionChange } = renderShell("Dashboard");

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));

    expect(onSectionChange).toHaveBeenCalledWith("Tasks");
  });

  it("renders context for the active section", () => {
    renderShell("Tasks");

    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Track open work, owners, due dates, and blocked items.")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update the existing auth shell smoke test**

In `tests/client/auth-shell.test.tsx`, keep the authenticated smoke test, but change its navigation assertion from the old generic nav expectation to the new primary section nav:

```tsx
await waitFor(() =>
  expect(screen.getByRole("navigation", { name: "Primary sections" })).toBeInTheDocument(),
);
expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
expect(screen.getByText(`Version ${appVersion}`)).toBeInTheDocument();
```

If this branch does not yet include `appVersion` in `auth-shell.test.tsx`, that is a prerequisite failure from PR #4. Stop and reconcile the base before continuing.

- [ ] **Step 3: Run focused tests to verify failure**

Run:

```bash
npx vitest run tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx
```

Expected: FAIL because `src/components/AppShell.tsx` does not yet render `Primary sections`, `Task Manager` as an accessible app mark, icon rail buttons, or context rail content.

- [ ] **Step 4: Commit failing tests**

```bash
git add tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx
git commit -m "test: specify split context rail shell"
```

---

### Task 2: Add Navigation Metadata

**Files:**
- Create: `src/components/shellNavigation.tsx`

- [ ] **Step 1: Create the navigation metadata module**

Create `src/components/shellNavigation.tsx`:

```tsx
import {
  BadgeCheck,
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  Users,
  type LucideIcon,
} from "lucide-react";

export const navItems = ["Dashboard", "Tasks", "Meetings", "Decisions", "People"] as const;

export type AppSection = (typeof navItems)[number];

export type ContextRow = {
  label: string;
  value?: string;
};

export type SectionNavigation = {
  icon: LucideIcon;
  description: string;
  contextRows: ContextRow[];
};

export const sectionNavigation: Record<AppSection, SectionNavigation> = {
  Dashboard: {
    icon: LayoutDashboard,
    description: "Today's operational picture, task pressure, and recent activity.",
    contextRows: [
      { label: "Overdue" },
      { label: "Due soon" },
      { label: "Open by person" },
      { label: "Recent meetings" },
    ],
  },
  Tasks: {
    icon: ListTodo,
    description: "Track open work, owners, due dates, and blocked items.",
    contextRows: [{ label: "Overdue" }, { label: "Due soon" }, { label: "Active" }, { label: "Done" }],
  },
  Meetings: {
    icon: CalendarDays,
    description: "Capture meetings, attendees, linked tasks, and recurring series.",
    contextRows: [{ label: "Recent meetings" }, { label: "Recurring series" }, { label: "Meetings with open tasks" }],
  },
  Decisions: {
    icon: BadgeCheck,
    description: "Find recorded decisions and the meeting context behind them.",
    contextRows: [{ label: "Recent decisions" }, { label: "Linked to meetings" }],
  },
  People: {
    icon: Users,
    description: "Shared list of assignees and meeting attendees.",
    contextRows: [{ label: "Total people" }, { label: "People with open tasks" }, { label: "People in recent meetings" }],
  },
};

export const sectionOrder = navItems.map((section) => ({
  section,
  ...sectionNavigation[section],
}));
```

- [ ] **Step 2: Run type check for the new module**

Run:

```bash
npm run check
```

Expected: PASS or the only failure is that `shellNavigation.tsx` is not yet imported. If TypeScript reports that `LucideIcon` is not exported, replace the imported type with:

```tsx
import type { ComponentType } from "react";

type IconProps = {
  "aria-hidden"?: boolean;
  size?: number;
  strokeWidth?: number;
};

export type SectionNavigation = {
  icon: ComponentType<IconProps>;
  description: string;
  contextRows: ContextRow[];
};
```

- [ ] **Step 3: Commit metadata module**

```bash
git add src/components/shellNavigation.tsx
git commit -m "feat: define shell navigation metadata"
```

---

### Task 3: Implement IconRail and ContextRail Components

**Files:**
- Create: `src/components/IconRail.tsx`
- Create: `src/components/ContextRail.tsx`

- [ ] **Step 1: Create `IconRail`**

Create `src/components/IconRail.tsx`:

```tsx
import { sectionOrder, type AppSection } from "./shellNavigation";

export function IconRail({
  section,
  onSectionChange,
  version,
}: {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  version: string;
}) {
  return (
    <aside className="icon-rail" aria-label="Task Manager">
      <div className="app-mark" aria-hidden="true">
        TM
      </div>
      <nav className="icon-rail-nav" aria-label="Primary sections">
        {sectionOrder.map(({ section: item, icon: Icon }) => (
          <button
            aria-current={item === section ? "page" : undefined}
            aria-label={item}
            className={item === section ? "icon-rail-button active" : "icon-rail-button"}
            key={item}
            onClick={() => onSectionChange(item)}
            title={item}
            type="button"
          >
            <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
          </button>
        ))}
      </nav>
      <p className="rail-version">
        <span className="rail-version-label">Version </span>
        {version}
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: Create `ContextRail`**

Create `src/components/ContextRail.tsx`:

```tsx
import { sectionNavigation, type AppSection } from "./shellNavigation";

export function ContextRail({ section }: { section: AppSection }) {
  const current = sectionNavigation[section];

  return (
    <aside className="context-rail" aria-label={`${section} context`}>
      <p className="context-eyebrow">Current section</p>
      <h2>{section}</h2>
      <p className="context-description">{current.description}</p>
      <div className="context-row-list" aria-label={`${section} shortcuts`}>
        {current.contextRows.map((row) => (
          <div className="context-row" key={row.label}>
            <span>{row.label}</span>
            {row.value ? <span className="context-row-value">{row.value}</span> : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Run focused type check**

Run:

```bash
npm run check
```

Expected: PASS. The components are not wired in yet, but TypeScript should validate imports and props.

- [ ] **Step 4: Commit rail components**

```bash
git add src/components/IconRail.tsx src/components/ContextRail.tsx
git commit -m "feat: add split rail components"
```

---

### Task 4: Wire the New Rails Into AppShell

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Replace sidebar markup in `AppShell`**

Modify `src/components/AppShell.tsx` to:

```tsx
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "../api/types";
import { ContextRail } from "./ContextRail";
import { GlobalSearch } from "./GlobalSearch";
import { IconRail } from "./IconRail";
import type { AppSection } from "./shellNavigation";

export type { AppSection } from "./shellNavigation";

export function AppShell({
  user,
  section,
  onSectionChange,
  onLogout,
  version,
  children,
}: {
  user: User;
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  onLogout: () => void;
  version: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <IconRail section={section} onSectionChange={onSectionChange} version={version} />
      <ContextRail section={section} />
      <div className="workspace">
        <header className="topbar">
          <GlobalSearch onOpenSection={onSectionChange} />
          <span className="user-name">{user.name}</span>
          <button className="icon-button" onClick={onLogout} aria-label="Sign out" type="button">
            <LogOut size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm `App.tsx` still passes `version`**

If PR #4 is present, `src/App.tsx` should already include:

```tsx
import { appVersion } from "./version";
```

and:

```tsx
<AppShell user={user} section={section} onSectionChange={setSection} onLogout={logout} version={appVersion}>
  {renderSection(section)}
</AppShell>
```

If that code is absent, stop and reconcile the branch with PR #4.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx vitest run tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx
```

Expected: tests may still fail visually related assertions if CSS class names are absent, but semantic tests for navigation/context should pass.

- [ ] **Step 4: Commit shell wiring**

```bash
git add src/components/AppShell.tsx
git commit -m "feat: wire split rail shell"
```

---

### Task 5: Add Split Rail Styling and Responsive Behavior

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace old sidebar desktop styles**

In `src/styles.css`, replace the old `.app-shell`, `.sidebar`, `.sidebar h1`, `.sidebar nav`, `.sidebar button`, and `.sidebar button.active` block near the top of the file with:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 72px 200px minmax(0, 1fr);
}

.icon-rail {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  justify-items: center;
  gap: 18px;
  background: #111827;
  color: #f8fafc;
  padding: 14px 10px;
}

.app-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #0f766e;
  color: #ffffff;
  font-weight: 800;
}

.icon-rail-nav {
  display: grid;
  align-content: start;
  gap: 10px;
}

.icon-rail-button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
}

.icon-rail-button.active,
.icon-rail-button:hover {
  background: #f8fafc;
  color: #111827;
}

.icon-rail-button:focus-visible {
  outline: 3px solid #2dd4bf;
  outline-offset: 2px;
}

.rail-version {
  margin: 0;
  color: #94a3b8;
  font-size: 0.66rem;
  line-height: 1.2;
  text-align: center;
  writing-mode: vertical-rl;
}

.context-rail {
  min-height: 100vh;
  border-right: 1px solid #d9dee7;
  background: #ffffff;
  padding: 18px 14px;
}

.context-eyebrow {
  margin: 0 0 8px;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.context-rail h2 {
  margin: 0;
  color: #111827;
  font-size: 1rem;
}

.context-description {
  margin: 8px 0 16px;
  color: #5b6475;
  font-size: 0.82rem;
  line-height: 1.4;
}

.context-row-list {
  display: grid;
  gap: 6px;
}

.context-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.8rem;
  padding: 8px 9px;
}

.context-row-value {
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.72rem;
  padding: 2px 7px;
}
```

- [ ] **Step 2: Replace mobile sidebar media query styles**

In the existing `@media (max-width: 760px)` block, replace the old `.app-shell`, `.sidebar`, `.sidebar nav`, and `.sidebar button` rules with:

```css
  .app-shell {
    grid-template-columns: 1fr;
  }

  .icon-rail {
    min-height: auto;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto;
    align-items: center;
    justify-items: stretch;
    gap: 10px;
    padding: 10px 12px;
  }

  .app-mark {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    font-size: 0.8rem;
  }

  .icon-rail-nav {
    grid-auto-flow: column;
    justify-content: center;
    gap: 6px;
  }

  .icon-rail-button {
    width: 36px;
    height: 36px;
  }

  .rail-version {
    writing-mode: initial;
    font-size: 0.7rem;
    text-align: right;
  }

  .rail-version-label {
    display: none;
  }

  .context-rail {
    display: none;
  }
```

- [ ] **Step 3: Add a narrow-tablet breakpoint**

Before the existing `@media (max-width: 760px)` block, add:

```css
@media (max-width: 980px) {
  .app-shell {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .context-rail {
    display: none;
  }
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit styles**

```bash
git add src/styles.css
git commit -m "style: add split context rail layout"
```

---

### Task 6: Full Verification and Browser Checks

**Files:**
- Verify only unless browser checks reveal CSS defects.

- [ ] **Step 1: Run full validation**

Run:

```bash
npm run check
npm run test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Start a local app for browser verification**

Use a temporary database so local state is not polluted:

```bash
DATABASE_PATH=/private/tmp/task-manager-rail-smoke.sqlite npm run invite:create -- --code=rail-smoke --limit=2 --label=RailSmoke
DATABASE_PATH=/private/tmp/task-manager-rail-smoke.sqlite PORT=4792 npm run dev
```

Expected: dev server listens on `http://localhost:4792`.

- [ ] **Step 3: Verify desktop layout in the browser**

Open `http://localhost:4792`, sign up with:

```text
Name: Rail Smoke
Email: rail-smoke@example.com
Password: long-enough-password
Invite code: rail-smoke
```

Desktop expectations:

- Icon rail is visible on the far left.
- Context panel is visible between icon rail and workspace.
- Topbar begins to the right of the context panel.
- `Version 1.0.1` is visible in the icon rail.
- The active Dashboard icon is visibly selected.
- No text overlaps in topbar, rail, or task workspace.

- [ ] **Step 4: Verify mobile layout in the browser**

Set browser viewport to around `390x844` or use the in-app browser viewport capability.

Mobile expectations:

- Icon rail becomes a compact horizontal strip.
- Context panel is hidden.
- Version remains visible as `1.0.1`.
- Search and topbar wrap without overlapping.
- Main content remains one column.

- [ ] **Step 5: Stop the local server**

Stop the dev server with `Ctrl-C`.

- [ ] **Step 6: Commit any browser-fix changes**

If browser verification required CSS fixes, run:

```bash
npm run check
npm run test
npm run build
git add src/styles.css tests/client/app-shell.test.tsx tests/client/auth-shell.test.tsx
git commit -m "fix: polish split rail responsive layout"
```

If no fixes were needed, do not create an empty commit.

---

### Task 7: Publish the Implementation Branch

**Files:**
- No source edits expected.

- [ ] **Step 1: Inspect final status**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected:

- Only intentional files are modified or committed.
- The existing untracked `deploy/com.philippe.web-ui-task-manager.plist` remains untracked and unstaged.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin codex/split-context-rail-design
```

Expected: branch is pushed.

- [ ] **Step 3: Open draft PR**

Run:

```bash
gh pr create --draft --base main --head codex/split-context-rail-design --title "[codex] Add split context rail" --body-file /private/tmp/split-context-rail-pr.md
```

Use this PR body in `/private/tmp/split-context-rail-pr.md`:

```markdown
## Summary

Replaces the plain left sidebar with a split icon rail plus context panel:

- adds accessible icon-only primary navigation
- adds selected-section context descriptions and shallow context rows
- keeps the main task-manager workspace dense and unchanged
- adds responsive behavior for tablet and mobile widths

## Validation

- `npm run check`
- `npm run test`
- `npm run build`
- desktop browser verification
- mobile browser verification
```

Expected: GitHub returns the draft PR URL.

---

## Plan Self-Review

- Spec coverage: The plan covers the split icon rail, context panel, visual direction, mobile collapse, component split, accessibility, testing, and non-goals.
- Scope guard: No new backend APIs are introduced; context rows are static labels unless existing cheap data is already available later.
- Version dependency: Explicit prerequisite prevents duplicating PR #4's visible-version work.
- Language scan: No red-flag filler wording or vague "add tests" steps remain.
