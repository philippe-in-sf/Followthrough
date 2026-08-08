import { CalendarPlus, FolderKanban, KeyRound, Mail, Save, Trash2, UserMinus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import type { User } from "../../api/types";
import type { WorkspaceOrganization } from "../../../shared/types";
import { FormField } from "../../components/FormField";

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Request failed";
}

export function SettingsPage({
  user,
  workCalendarUrl,
  onWorkCalendarUrlChange,
  googleCalendarConfigured,
  googleCalendarConnected,
  googleCalendarEmail,
  onGoogleCalendarConnectionChange,
  onLeaveTeam,
  projectsEnabled = false,
  workspaceOrganization = "classic",
  onWorkspaceOrganizationChange = async () => {},
}: {
  user: User;
  workCalendarUrl: string | null;
  onWorkCalendarUrlChange: (workCalendarUrl: string | null) => void;
  googleCalendarConfigured: boolean;
  googleCalendarConnected: boolean;
  googleCalendarEmail: string | null;
  onGoogleCalendarConnectionChange: (connected: boolean, email: string | null) => void;
  onLeaveTeam: () => Promise<void>;
  projectsEnabled?: boolean;
  workspaceOrganization?: WorkspaceOrganization;
  onWorkspaceOrganizationChange?: (organization: WorkspaceOrganization) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(false);
  const [savedWorkCalendarUrl, setSavedWorkCalendarUrl] = useState<string | null>(workCalendarUrl);
  const [digestLoading, setDigestLoading] = useState(true);
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestError, setDigestError] = useState("");
  const [digestStatus, setDigestStatus] = useState("");
  const [workCalendarInput, setWorkCalendarInput] = useState(workCalendarUrl ?? "");
  const [workCalendarSaving, setWorkCalendarSaving] = useState(false);
  const [workCalendarError, setWorkCalendarError] = useState("");
  const [workCalendarStatus, setWorkCalendarStatus] = useState("");
  const [googleCalendarDisconnecting, setGoogleCalendarDisconnecting] = useState(false);
  const [googleCalendarError, setGoogleCalendarError] = useState("");
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState("");
  const [calendarFeedAvailable, setCalendarFeedAvailable] = useState(false);
  const [calendarFeedConfigured, setCalendarFeedConfigured] = useState(false);
  const [calendarFeedInput, setCalendarFeedInput] = useState("");
  const [calendarFeedSaving, setCalendarFeedSaving] = useState(false);
  const [calendarFeedError, setCalendarFeedError] = useState("");
  const [calendarFeedStatus, setCalendarFeedStatus] = useState("");
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");

  useEffect(() => {
    setWorkCalendarInput(workCalendarUrl ?? "");
    setSavedWorkCalendarUrl(workCalendarUrl);
  }, [workCalendarUrl]);

  useEffect(() => {
    let active = true;

    async function loadPreferences() {
      try {
        const preferences = await api.preferences.get();
        if (!active) return;
        setWeeklyDigestEnabled(preferences.weeklyDigestEnabled);
        setSavedWorkCalendarUrl(preferences.workCalendarUrl);
        setWorkCalendarInput(preferences.workCalendarUrl ?? "");
      } catch (error) {
        if (!active) return;
        setDigestError(errorMessage(error));
      } finally {
        if (active) setDigestLoading(false);
      }
    }

    void loadPreferences();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void api.calendarFeed
      .connection()
      .then((status) => {
        if (!active) return;
        setCalendarFeedAvailable(status.available);
        setCalendarFeedConfigured(status.configured);
      })
      .catch(() => {
        if (active) setCalendarFeedAvailable(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordStatus("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    setPasswordSubmitting(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password updated");
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setPasswordSubmitting(false);
    }
  }

  async function leaveTeam() {
    setTeamError("");
    setTeamSubmitting(true);
    try {
      await onLeaveTeam();
    } catch (error) {
      setTeamError(errorMessage(error));
    } finally {
      setTeamSubmitting(false);
    }
  }

  async function updateDigestPreference(enabled: boolean) {
    setWeeklyDigestEnabled(enabled);
    setDigestSaving(true);
    setDigestError("");
    setDigestStatus("");
    try {
      const preferences = await api.preferences.update({
        workCalendarUrl: savedWorkCalendarUrl,
        weeklyDigestEnabled: enabled,
      });
      setWeeklyDigestEnabled(preferences.weeklyDigestEnabled);
      setSavedWorkCalendarUrl(preferences.workCalendarUrl);
      onWorkCalendarUrlChange(preferences.workCalendarUrl);
      setDigestStatus(preferences.weeklyDigestEnabled ? "Weekly digest enabled" : "Weekly digest off");
    } catch (error) {
      setWeeklyDigestEnabled((current) => !current);
      setDigestError(errorMessage(error));
    } finally {
      setDigestSaving(false);
    }
  }

  async function saveWorkCalendar(nextWorkCalendarUrl: string | null) {
    setWorkCalendarSaving(true);
    setWorkCalendarError("");
    setWorkCalendarStatus("");
    try {
      const preferences = await api.preferences.update({
        workCalendarUrl: nextWorkCalendarUrl,
      });
      setSavedWorkCalendarUrl(preferences.workCalendarUrl);
      setWorkCalendarInput(preferences.workCalendarUrl ?? "");
      onWorkCalendarUrlChange(preferences.workCalendarUrl);
      setWorkCalendarStatus(
        preferences.workCalendarUrl
          ? "Calendar shortcut saved."
          : "Calendar shortcut cleared.",
      );
    } catch (error) {
      setWorkCalendarError(
        error instanceof Error ? error.message : "Calendar shortcut could not be saved.",
      );
    } finally {
      setWorkCalendarSaving(false);
    }
  }

  async function submitWorkCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveWorkCalendar(workCalendarInput);
  }

  async function clearWorkCalendar() {
    setWorkCalendarInput("");
    await saveWorkCalendar(null);
  }

  async function disconnectGoogleCalendar() {
    setGoogleCalendarDisconnecting(true);
    setGoogleCalendarError("");
    setGoogleCalendarStatus("");
    try {
      await api.googleCalendar.disconnect();
      onGoogleCalendarConnectionChange(false, null);
      setGoogleCalendarStatus("Google Calendar disconnected.");
    } catch (error) {
      setGoogleCalendarError(
        error instanceof Error ? error.message : "Google Calendar could not be disconnected.",
      );
    } finally {
      setGoogleCalendarDisconnecting(false);
    }
  }

  async function saveCalendarFeed() {
    if (!calendarFeedInput.trim()) return;
    setCalendarFeedSaving(true);
    setCalendarFeedError("");
    setCalendarFeedStatus("");
    try {
      const status = await api.calendarFeed.save(calendarFeedInput);
      setCalendarFeedAvailable(status.available);
      setCalendarFeedConfigured(status.configured);
      setCalendarFeedInput("");
      setCalendarFeedStatus("Private iCalendar feed saved.");
    } catch (error) {
      setCalendarFeedError(
        error instanceof Error ? error.message : "Calendar feed could not be saved.",
      );
    } finally {
      setCalendarFeedSaving(false);
    }
  }

  async function disconnectCalendarFeed() {
    setCalendarFeedSaving(true);
    setCalendarFeedError("");
    setCalendarFeedStatus("");
    try {
      await api.calendarFeed.disconnect();
      setCalendarFeedConfigured(false);
      setCalendarFeedInput("");
      setCalendarFeedStatus("Private iCalendar feed removed.");
    } catch (error) {
      setCalendarFeedError(
        error instanceof Error ? error.message : "Calendar feed could not be removed.",
      );
    } finally {
      setCalendarFeedSaving(false);
    }
  }

  async function changeWorkspaceOrganization(organization: WorkspaceOrganization) {
    setWorkspaceSaving(true);
    setWorkspaceStatus("");
    setWorkspaceError("");
    try {
      await onWorkspaceOrganizationChange(organization);
      setWorkspaceStatus(
        organization === "projects"
          ? "Project-centered workspace enabled."
          : "Classic workspace restored.",
      );
    } catch (error) {
      setWorkspaceError(errorMessage(error));
    } finally {
      setWorkspaceSaving(false);
    }
  }

  return (
    <main className="page settings-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Account settings</h1>
        </div>
      </section>

      <section className="settings-layout">
        <form className="settings-panel" onSubmit={updatePassword}>
          <div className="panel-heading">
            <div>
              <h2>Password</h2>
              <p>Update the password you use to sign in.</p>
            </div>
            <KeyRound aria-hidden="true" size={20} />
          </div>
          <FormField label="Current password">
            <input
              autoComplete="current-password"
              name="currentPassword"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </FormField>
          <FormField label="New password">
            <input
              autoComplete="new-password"
              minLength={12}
              name="newPassword"
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </FormField>
          <FormField label="Confirm new password">
            <input
              autoComplete="new-password"
              minLength={12}
              name="confirmPassword"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </FormField>
          {passwordError ? <p className="form-error">{passwordError}</p> : null}
          {passwordStatus ? <p className="form-status">{passwordStatus}</p> : null}
          <button className="primary-button" disabled={passwordSubmitting} type="submit">
            {passwordSubmitting ? "Updating..." : "Update password"}
          </button>
        </form>

        <section className="settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Weekly digest</h2>
              <p>Receive a weekly email with completed work, open tasks, meetings, and decisions.</p>
            </div>
            <Mail aria-hidden="true" size={20} />
          </div>
          <label className="checkbox-line">
            <input
              checked={weeklyDigestEnabled}
              disabled={digestLoading || digestSaving}
              onChange={(event) => void updateDigestPreference(event.target.checked)}
              type="checkbox"
            />
            <span>Email me the weekly workspace digest</span>
          </label>
          {digestError ? <p className="form-error">{digestError}</p> : null}
          {digestStatus ? <p className="form-status">{digestStatus}</p> : null}
        </section>

        {projectsEnabled ? (
          <section className="settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Workspace organization</h2>
                <p>Switch between the established record views and the project-centered workspace.</p>
              </div>
              <FolderKanban aria-hidden="true" size={20} />
            </div>
            <div className="segmented-control" aria-label="Workspace organization">
              <button
                aria-pressed={workspaceOrganization === "classic"}
                className={workspaceOrganization === "classic" ? "active" : ""}
                disabled={workspaceSaving}
                type="button"
                onClick={() => void changeWorkspaceOrganization("classic")}
              >
                Classic
              </button>
              <button
                aria-pressed={workspaceOrganization === "projects"}
                className={workspaceOrganization === "projects" ? "active" : ""}
                disabled={workspaceSaving}
                type="button"
                onClick={() => void changeWorkspaceOrganization("projects")}
              >
                Projects
              </button>
            </div>
            <p className="settings-panel-copy">
              Switching views does not migrate, delete, or rewrite existing meeting notes.
            </p>
            {workspaceError ? <p className="form-error">{workspaceError}</p> : null}
            {workspaceStatus ? <p className="form-status">{workspaceStatus}</p> : null}
          </section>
        ) : null}

        <form
          className="settings-panel calendar-settings-panel"
          aria-label="Calendar settings"
          onSubmit={submitWorkCalendar}
        >
          <div className="panel-heading">
            <div>
              <h2>Calendar</h2>
              <p>Connect meeting sources and keep the calendar shortcut available in the sidebar.</p>
            </div>
            <CalendarPlus aria-hidden="true" size={20} />
          </div>
          <section className="google-calendar-connection" aria-label="Google Calendar connection">
            <div>
              <strong>Google Calendar</strong>
              <span>
                {googleCalendarConnected
                  ? `Connected as ${googleCalendarEmail ?? "Google Calendar"}`
                  : googleCalendarConfigured
                    ? "Google Calendar is not connected."
                    : "Google Calendar connection is not available."}
              </span>
            </div>
            {googleCalendarConnected ? (
              <button
                className="secondary-button icon-text-button"
                type="button"
                onClick={disconnectGoogleCalendar}
                disabled={googleCalendarDisconnecting}
              >
                <Trash2 aria-hidden="true" size={17} />
                {googleCalendarDisconnecting ? "Disconnecting" : "Disconnect Google Calendar"}
              </button>
            ) : googleCalendarConfigured ? (
              <a className="primary-button icon-text-button" href="/api/google-calendar/connect">
                <CalendarPlus aria-hidden="true" size={17} />
                Connect Google Calendar
              </a>
            ) : null}
          </section>
          {googleCalendarError ? (
            <p className="form-error" role="alert">
              {googleCalendarError}
            </p>
          ) : null}
          {googleCalendarStatus ? (
            <p className="form-status" role="status">
              {googleCalendarStatus}
            </p>
          ) : null}
          <section className="google-calendar-connection" aria-label="iCalendar feed connection">
            <div>
              <strong>Private iCalendar feed</strong>
              <span>
                {calendarFeedConfigured
                  ? "Feed URL saved."
                  : calendarFeedAvailable
                    ? "No feed URL saved."
                    : "Calendar feed encryption is not configured."}
              </span>
            </div>
            {calendarFeedConfigured ? (
              <button
                className="secondary-button icon-text-button"
                type="button"
                onClick={disconnectCalendarFeed}
                disabled={calendarFeedSaving}
              >
                <Trash2 aria-hidden="true" size={17} />
                {calendarFeedSaving ? "Removing" : "Remove feed"}
              </button>
            ) : null}
          </section>
          <FormField label="Private iCalendar feed URL">
            <input
              type="password"
              autoComplete="off"
              value={calendarFeedInput}
              onChange={(event) => setCalendarFeedInput(event.target.value)}
              placeholder={
                calendarFeedConfigured
                  ? "Paste a replacement feed URL"
                  : "https://calendar.example.com/private.ics"
              }
              disabled={!calendarFeedAvailable}
            />
          </FormField>
          <div className="calendar-settings-actions">
            <button
              className="primary-button icon-text-button"
              type="button"
              onClick={saveCalendarFeed}
              disabled={calendarFeedSaving || !calendarFeedAvailable || !calendarFeedInput.trim()}
            >
              <Save aria-hidden="true" size={17} />
              {calendarFeedSaving
                ? "Saving"
                : calendarFeedConfigured
                  ? "Replace feed"
                  : "Save feed"}
            </button>
          </div>
          {calendarFeedError ? (
            <p className="form-error" role="alert">
              {calendarFeedError}
            </p>
          ) : null}
          {calendarFeedStatus ? (
            <p className="form-status" role="status">
              {calendarFeedStatus}
            </p>
          ) : null}
          <FormField label="Calendar shortcut URL">
            <input
              type="url"
              value={workCalendarInput}
              onChange={(event) => setWorkCalendarInput(event.target.value)}
              placeholder="https://calendar.example.com/team"
            />
          </FormField>
          <div className="calendar-settings-actions">
            <button
              className="primary-button icon-text-button"
              type="submit"
              disabled={workCalendarSaving}
            >
              <Save aria-hidden="true" size={17} />
              {workCalendarSaving ? "Saving" : "Save shortcut"}
            </button>
            <button
              className="secondary-button icon-text-button"
              type="button"
              onClick={clearWorkCalendar}
              disabled={workCalendarSaving || !workCalendarInput.trim()}
            >
              <Trash2 aria-hidden="true" size={17} />
              Clear shortcut
            </button>
          </div>
          {workCalendarError ? (
            <p className="form-error" role="alert">
              {workCalendarError}
            </p>
          ) : null}
          {workCalendarStatus ? (
            <p className="form-status" role="status">
              {workCalendarStatus}
            </p>
          ) : null}
        </form>

        <section className="settings-panel settings-danger-panel">
          <div className="panel-heading">
            <div>
              <h2>Team access</h2>
              <p>
                You are signed in as {user.name} on {user.team.name}.
              </p>
            </div>
            <UserMinus aria-hidden="true" size={20} />
          </div>
          <p className="settings-panel-copy">
            Leaving the team moves you to a new personal workspace and removes access to this team's tasks,
            meetings, decisions, and people records.
          </p>
          {teamError ? <p className="form-error">{teamError}</p> : null}
          <button className="danger-button" disabled={teamSubmitting} onClick={leaveTeam} type="button">
            {teamSubmitting ? "Leaving..." : "Leave team"}
          </button>
        </section>
      </section>
    </main>
  );
}
