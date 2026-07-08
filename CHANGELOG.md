# Changelog

All notable changes to Followthrough are tracked here. This file was created after the fact on 2026-06-16 by reconstructing history from git commits, package-version changes, implementation specs, and deployment notes. Some early version numbers were skipped in package history; those gaps are called out instead of being laundered into fake precision, because apparently we are adults now.

## Unreleased

### Planned

- Keep adding release notes before each package version bump and deployment.
- Consider adding richer archive filters once real archived volume makes the shape obvious.
- Keep improving meeting capture so dense operational screens stay usable under real-world attendee and task counts.

## 1.2.14 - 2026-07-07

### Added

- Added a Settings page for account controls, including password updates and the team-leave action.

### Changed

- Moved the leave-team action out of the topbar to reduce accidental clicks.

## 1.2.13 - 2026-07-07

### Changed

- Removed the dedicated white logo treatment and kept the marketing header on the standard icon and text branding.

## 1.2.12 - 2026-07-07

### Changed

- Replaced the built-in Followthrough mark with the new logo assets across the shell, marketing header, favicon, and notifications.

## 1.2.11 - 2026-07-07

### Fixed

- Matched the task description and blocker field heights in the task create form.

## 1.2.10 - 2026-07-07

### Added

- Added a second Save notes button directly beside the meeting notes editor for easier in-context saving.

## 1.2.9 - 2026-07-07

### Added

- Added a markdown toolbar and rich rendered note display for task, meeting, series, and related-record note fields.

## 1.2.8 - 2026-07-07

### Added

- Added optional follow-up task creation from decisions, including decision/meeting linkage and spawned-task audit history.

## 1.2.7 - 2026-07-07

### Added

- Linked inline task, person, meeting, decision, and series tags in record notes, audit history, and related-record displays.

## 1.2.6 - 2026-07-07

### Fixed

- Stopped new recurring meeting occurrences from copying notes out of earlier meetings in the same series.

## 1.2.5 - 2026-07-07

### Changed

- Shifted deploy verification to rely on the required PR `Verify` workflow while keeping deploy builds focused on release artifact packaging.

### Fixed

- Improved parchment dashboard pulse contrast so blocker and open-task counts stay readable on light metric rows.

## 1.2.4 - 2026-07-07

### Changed

- Collapsed the skin selector behind a compact icon menu to reduce header clutter while keeping all theme options accessible.

## 1.2.3 - 2026-07-07

### Added

- Added a guided onboarding tour with first-run launch, relaunch controls, highlighted feature targets, and per-user completion state.

## 1.2.2 - 2026-07-06

### Added

- Made task reference chips clickable for originating meetings, originating decisions, and meeting series.

### Changed

- Collapsed Meetings calendar settings behind a compact header control so meeting capture keeps the prime page space.

### Fixed

- Preserved meeting notes and links when changing a meeting into a recurring series.

## 1.2.1 - 2026-07-04

### Added

- Added a repeatable production domain and TLS check for `followthrough.dev`.
- Documented how Namecheap's SSL provider change relates to the server-managed
  Let's Encrypt certificate renewal path.

## 1.2.0 - 2026-07-03

### Added

- Added decision-to-task traceability so decisions list the tasks they spawned and task creation records decision audit events.
- Added lightweight browser notification support for newly assigned tasks, including notification storage, opt-in browser polling, and a service worker scaffold for future web push delivery.

### Changed

- Bumped the deployed minor version for the decision traceability and assignment notification release.

## 1.1.26 - 2026-07-02

### Fixed

- Improved blocker text contrast in dark themes for task, meeting, dashboard, and people views.

## 1.1.25 - 2026-07-02

### Changed

- Redesigned the dashboard with a modern command-center layout, metric tiles, priority sections, and responsive spacing aligned with the marketing homepage.

## 1.1.24 - 2026-07-02

### Fixed

- Sorted task dependency picklists by task number and shared the numeric public-ID sort rule with meeting task picklists.

## 1.1.23 - 2026-07-02

### Added

- Added task dependencies so work can be marked as waiting on completion of other tasks.

## 1.1.22 - 2026-07-01

### Fixed

- Fixed meeting setup controls so calendar shortcut and quick-add meeting fields wrap instead of overlapping in narrower workspaces.

## 1.1.21 - 2026-07-01

### Added

- Added quick task creation directly from the meeting notes Work panel.

### Changed

- Sorted meeting task picklists by task number in meeting creation and edit flows.

## 1.1.20 - 2026-07-01

### Changed

- Standardized people records on separate first and last name fields.
- Updated meeting attendee quick-add to accept full names while preserving fast meeting capture.

### Fixed

- Kept local test runs out of temporary worktrees so old copied tests do not pollute active development.

## 1.1.19 - 2026-07-01

### Fixed

- Show audit history timestamps in local time with a timezone label.

## 1.1.18 - 2026-07-01

### Fixed

- Added a clear Add meeting confirmation so the wizard reset after saving no longer looks like a broken loop.
- Hardened Add meeting wizard field updates so People & Work changes cannot overwrite earlier Basics values.

## 1.1.17 - 2026-07-01

### Added

- Added a guided Add meeting wizard with visible steps for basics, people and work, and details.
- Kept a compact quick-add meeting path for fast capture.

### Fixed

- Prevented early form submission from creating a meeting before the wizard reaches the details step.

## 1.1.16 - 2026-06-30

### Added

- Added an admin waitlist queue for recent public beta signups.
- Added admin actions to create one-use invite codes or direct users from waitlist signups and mark each signup handled.

## 1.1.15 - 2026-06-29

### Added

- Added self-service team leaving and admin user removal from a team.
- Moved users who leave or are removed into a new personal team so prior team tasks, meetings, decisions, and people records remain protected.

### Fixed

- Fixed meeting edit datetime conversion so saved meeting times no longer drift by the local timezone offset.

## 1.1.14 - 2026-06-29

### Changed

- Replaced the Decisions form Meeting ID text field with a recent-meetings select.

## 1.1.13 - 2026-06-29

### Fixed

- Added visible saving, saved, and error feedback to the meeting notes editor so the Save notes action no longer appears inert.

## 1.1.12 - 2026-06-29

### Added

- Added a consolidated recurring-series notes view so all visible meeting notes in a series can be read together chronologically.

## 1.1.11 - 2026-06-26

### Added

- Added public private-beta waitlist signup from the signed-out homepage.
- Added storage for waitlist names and normalized email addresses.

### Changed

- Collapsed account access and waitlist forms into compact expandable panels.
- Moved the changelog link into a simple signed-out footer.
- Improved signed-out homepage label contrast on light sections.

## 1.1.10 - 2026-06-26

### Fixed

- Fixed Meetings page dark-skin contrast for the archive toggle and attendee/task checkbox rows.

## 1.1.9 - 2026-06-26

### Fixed

- Fixed Admin team settings contrast inside app skins so darker themes no longer show light configuration panels, table rows, or role selectors.

## 1.1.8 - 2026-06-26

### Added

- Added a unified Add meeting flow for one-time meetings, existing recurring meetings, and new recurring meetings.
- Added support for carrying explicitly selected task links into recurring occurrences alongside open series task carry-over.

### Changed

- Removed the separate Meeting series and Next occurrence creation forms from the Meetings page.
- Kept active recurring series as a compact reference lane instead of a second scheduling workflow.

## 1.1.7 - 2026-06-26

### Added

- Added single-team workspaces with `admin` and `member` roles.
- Added admin-only team settings for team name, logo, and shared calendar shortcut.
- Added admin user management for direct user creation and role assignment, with a last-admin safeguard.

### Changed

- Scoped shared people, tasks, meetings, meeting series, decisions, dashboard data, and search results to the signed-in user's team.
- Kept invite-code signup as a member-onboarding path while direct CLI user creation remains an admin fallback.

## 1.1.6 - 2026-06-26

### Note

- Reserved to avoid reusing a production-reported version number that was not present on remote main.

## 1.1.5 - 2026-06-23

### Added

- Added Cookiebot consent loading to the app shell and public changelog page.

## 1.1.4 - 2026-06-23

### Added

- Added Google Tag Manager to the app shell and public changelog page.

## 1.1.3 - 2026-06-23

### Added

- Added a signed-out marketing homepage that explains Followthrough's purpose before account access.

### Fixed

- Restored collapsed meeting cards after the branch rebase so meeting details expand on demand again.
- Made session expiry checks use the application clock instead of SQLite wall-clock time.
- Stabilized Vitest browser storage setup for app-shell tests.

## 1.1.2 - 2026-06-22

### Fixed

- Fixed Google Calendar settings and import panel contrast inside app skins so dark themes no longer show light panels with low-contrast text.

## 1.1.1 - 2026-06-22

### Changed

- Made Google Calendar import user-connectable through OAuth, with the pasted calendar URL kept as a secondary shortcut option.

## 1.1.0 - 2026-06-22

### Added

- Added two light skins — **Daylight** (cool blue-gray) and **Parchment** (warm amber) — so the skin selector now offers a mix of dark and light themes.

## 1.0.30 - 2026-06-21

### Fixed

- Fixed dark-skin task and meeting card contrast so collapsed and expanded cards remain dark and readable.

## 1.0.29 - 2026-06-21

### Fixed

- Collapsed raw URLs in collapsed task card summaries to `Link`.
- Reused the collapsed task summary text for task summary button accessibility labels.

## 1.0.27 - 2026-06-16

### Added

- Added a public changelog page at `/changelog` and a Markdown endpoint at `/api/changelog`.
- Added a backwards-looking release history reconstructed from git commits, package-version changes, specs, and deployment notes.
- Added signed-out and authenticated UI links to the changelog.

### Changed

- Added a deployment gate requiring `CHANGELOG.md` to include a matching entry for the package version.
- Included `CHANGELOG.md` in deployment release artifacts so production can serve the public changelog.

## 1.0.26 - 2026-06-16

### Added

- Added active and archived views for tasks and meetings.
- Added restore flows for archived tasks and meetings.
- Added server-side archived-list retrieval and restore endpoints.

### Changed

- Cleaned up the meetings screen with compact attendee and task pickers.
- Kept Archive actions out of collapsed and expanded list cards; archiving now lives behind the intentional edit-details path with confirmation.
- Hid creation-heavy meeting forms while viewing archived meetings.

## 1.0.25 - 2026-06-16

### Changed

- Collapsed meeting and task list cards into single summary rows that expand on click.
- Consolidated list-card detail fields so scanning active work is less of a full-contact sport.

## 1.0.24 - 2026-06-16

### Added

- Added progress notes to tasks.
- Added tests and UI support for task notes in standalone tasks and meeting-linked tasks.

## 1.0.23 - 2026-06-16

### Note

- No distinct package-version commit was found for this version in reachable history. The package history moves from `1.0.22` to `1.0.24`.

## 1.0.22 - 2026-06-15

### Added

- Added blocker tracking for meetings and tasks, including active and cleared blocker states.
- Added blocker-aware dashboard and record-card treatment.

## 1.0.21 - 2026-06-15

### Added

- Added the meeting notes workspace.
- Added structured meeting links and carry-forward behavior for recurring meeting notes and links.

## 1.0.20 - 2026-06-14

### Changed

- Collapsed task links in meeting forms so long task URLs stop eating the room.

## 1.0.19 - 2026-06-14

### Changed

- Moved person archival into admin controls to reduce accidental people-list damage.

## 1.0.18 - 2026-06-14

### Added

- Added people archive tooling.
- Added people merge tooling for consolidating duplicate assignees or attendees.

## 1.0.17 - 2026-06-14

### Fixed

- Improved wrapping for related-record links.

## 1.0.16 - 2026-06-14

### Added

- Added related-record views for people, including their tasks, meetings, and decisions.

## 1.0.15 - 2026-06-14

### Changed

- Made task reminders manual-only in the UI.

## 1.0.14 - 2026-06-14

### Changed

- Updated task reminder email copy.

## 1.0.13 - 2026-06-14

### Added

- Added the mobile shell interface.

### Note

- No distinct package-version commit was found for `1.0.12`; package history moves from `1.0.11` to `1.0.13`.

## 1.0.11 - 2026-06-14

### Fixed

- Updated the app title.

## 1.0.10 - 2026-06-12

### Added

- Added dashboard record opening so task, meeting, and decision summaries can jump into their detail views.

## 1.0.9 - 2026-06-12

### Fixed

- Fixed production invite and user creation script support.

## 1.0.8 - 2026-06-12

### Added

- Added creator-only private records.
- Added production user creation support.

## 1.0.7 - 2026-06-12

### Added

- Added the Followthrough monogram.

## 1.0.6 - 2026-06-12

### Fixed

- Collapsed task-description links so long URLs do not dominate cards.

## 1.0.5 - 2026-06-12

### Fixed

- Improved wrapping for dashboard task descriptions.

## 1.0.4 - 2026-06-12

### Added

- Added task email reminders.
- Added SMTP-backed reminder sending and reminder audit history.

## 1.0.3 - 2026-06-12

### Added

- Added people editing from the People screen.
- Added people audit history.
- Added the work-calendar rail shortcut.

## 1.0.2 - 2026-06-12

### Added

- Added the split icon rail and contextual side rail shell.
- Added section navigation metadata and focused app-shell tests.

## 1.0.1 - 2026-06-11

### Added

- Added visible app version display in the authenticated shell.
- Added public `/api/version` for deployment verification.

### Changed

- Added deployment duplicate-version protection so the deploy runner refuses to ship the same package version twice.

## 1.0.0 - 2026-06-09 to 2026-06-11

### Added

- Built the initial Followthrough app: invite-code auth, SQLite persistence, public IDs, people, tasks, meetings, recurring series, decisions, search, and dashboard APIs.
- Added the authenticated React app shell with Dashboard, Tasks, Meetings, Decisions, and People sections.
- Added recurring meeting carry-over for open work.
- Added audit logs and inline editing.
- Added deployment tooling for Linux hosts over SSH with immutable releases, `current` symlink switching, `systemd` restart, and health checks.

### Fixed

- Hardened SQLite transactions and migrations.
- Hardened deployment path validation, command rendering, cleanup, and service installation.
