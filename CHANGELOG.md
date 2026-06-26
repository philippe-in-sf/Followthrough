# Changelog

All notable changes to Followthrough are tracked here. This file was created after the fact on 2026-06-16 by reconstructing history from git commits, package-version changes, implementation specs, and deployment notes. Some early version numbers were skipped in package history; those gaps are called out instead of being laundered into fake precision, because apparently we are adults now.

## Unreleased

### Planned

- Keep adding release notes before each package version bump and deployment.
- Consider adding richer archive filters once real archived volume makes the shape obvious.
- Keep improving meeting capture so dense operational screens stay usable under real-world attendee and task counts.

## 1.1.3 - 2026-06-26

### Added

- Added single-team workspaces with `admin` and `member` roles.
- Added admin-only team settings for team name, logo, and shared calendar shortcut.
- Added admin user management for direct user creation and role assignment, with a last-admin safeguard.

### Changed

- Scoped shared people, tasks, meetings, meeting series, decisions, dashboard data, and search results to the signed-in user's team.
- Kept invite-code signup as a member-onboarding path while direct CLI user creation remains an admin fallback.

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
