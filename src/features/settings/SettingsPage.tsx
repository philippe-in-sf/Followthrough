import { KeyRound, Mail, UserMinus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import type { User } from "../../api/types";
import { FormField } from "../../components/FormField";

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Request failed";
}

export function SettingsPage({
  user,
  onLeaveTeam,
}: {
  user: User;
  onLeaveTeam: () => Promise<void>;
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
  const [workCalendarUrl, setWorkCalendarUrl] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestError, setDigestError] = useState("");
  const [digestStatus, setDigestStatus] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPreferences() {
      try {
        const preferences = await api.preferences.get();
        if (!active) return;
        setWeeklyDigestEnabled(preferences.weeklyDigestEnabled);
        setWorkCalendarUrl(preferences.workCalendarUrl);
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
        workCalendarUrl,
        weeklyDigestEnabled: enabled,
      });
      setWeeklyDigestEnabled(preferences.weeklyDigestEnabled);
      setWorkCalendarUrl(preferences.workCalendarUrl);
      setDigestStatus(preferences.weeklyDigestEnabled ? "Weekly digest enabled" : "Weekly digest off");
    } catch (error) {
      setWeeklyDigestEnabled((current) => !current);
      setDigestError(errorMessage(error));
    } finally {
      setDigestSaving(false);
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
