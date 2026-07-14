import { type FormEvent, useMemo, useState } from "react";
import {
  AlarmClockCheck,
  ArrowRight,
  BellRing,
  CalendarCheck,
  ChevronDown,
  ListChecks,
  Search,
  UsersRound,
} from "lucide-react";
import { api } from "../../api/client";
import type { User } from "../../api/types";
import { BrandMark } from "../../components/BrandMark";
import { FormField } from "../../components/FormField";

export function AuthPage({ onAuth }: { onAuth: (user: User) => void }) {
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get("resetToken"), []);
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(
    resetToken ? "reset" : "login",
  );
  const [openAccessPanel, setOpenAccessPanel] = useState<"account" | "waitlist" | null>(
    resetToken ? "account" : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [passwordResetStatus, setPasswordResetStatus] = useState<string | null>(null);
  const [passwordResetSubmitting, setPasswordResetSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistStatus, setWaitlistStatus] = useState<string | null>(null);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);

  const accountPanelOpen = openAccessPanel === "account";
  const waitlistPanelOpen = openAccessPanel === "waitlist";

  function toggleAccessPanel(panel: "account" | "waitlist") {
    setOpenAccessPanel((current) => (current === panel ? null : panel));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const result =
        mode === "login"
          ? await api.login({
              email: String(form.get("email")),
              password: String(form.get("password")),
            })
          : await api.signup({
              name: String(form.get("name")),
              email: String(form.get("email")),
              password: String(form.get("password")),
              inviteCode: String(form.get("inviteCode")),
            });
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  async function submitPasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPasswordResetStatus(null);
    setPasswordResetSubmitting(true);

    try {
      await api.requestPasswordReset({ email: String(form.get("email")) });
      setPasswordResetStatus("If that email has access, a reset link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request password reset");
    } finally {
      setPasswordResetSubmitting(false);
    }
  }

  async function submitPasswordResetConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword"));
    const confirmPassword = String(form.get("confirmPassword"));
    setError(null);
    setPasswordResetStatus(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setPasswordResetSubmitting(true);
    try {
      await api.confirmPasswordReset({ token: resetToken ?? "", newPassword });
      window.history.replaceState({}, "", `${window.location.pathname}#access`);
      setPasswordResetStatus("Password reset. Sign in with your new password.");
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password");
    } finally {
      setPasswordResetSubmitting(false);
    }
  }

  async function submitWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setWaitlistError(null);
    setWaitlistStatus(null);
    setWaitlistSubmitting(true);

    try {
      await api.waitlist({
        name: String(form.get("waitlistName")),
        email: String(form.get("waitlistEmail")),
      });
      formElement.reset();
      setWaitlistStatus("You're on the waiting list. We'll follow up when access opens.");
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : "Unable to join the waiting list");
    } finally {
      setWaitlistSubmitting(false);
    }
  }

  return (
    <main className="auth-page marketing-page">
      <section className="marketing-hero" id="top" aria-labelledby="marketing-heading">
        <div className="marketing-snapshot" aria-hidden="true">
          <div className="snapshot-shell">
            <div className="snapshot-rail">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="snapshot-main">
              <div className="snapshot-bar">
                <span />
                <span />
              </div>
              <div className="snapshot-grid">
                <div className="snapshot-panel snapshot-panel-wide">
                  <div className="snapshot-panel-title">
                    <span>Due soon</span>
                    <strong>7</strong>
                  </div>
                  <div className="snapshot-task-line">
                    <span>T042</span>
                    <p>Send pricing follow-up to the implementation team</p>
                  </div>
                  <div className="snapshot-task-line">
                    <span>M018</span>
                    <p>Carry open launch tasks into Tuesday standup</p>
                  </div>
                  <div className="snapshot-task-line snapshot-task-line-hot">
                    <span>D011</span>
                    <p>Confirm support owner before rollout</p>
                  </div>
                </div>
                <div className="snapshot-panel">
                  <div className="snapshot-panel-title">
                    <span>Owners</span>
                    <strong>12</strong>
                  </div>
                  <div className="snapshot-pill-list">
                    <span>Alex</span>
                    <span>Priya</span>
                    <span>Jordan</span>
                  </div>
                </div>
                <div className="snapshot-panel">
                  <div className="snapshot-panel-title">
                    <span>Reminders</span>
                    <strong>4</strong>
                  </div>
                  <div className="snapshot-meter">
                    <span />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <header className="marketing-nav" aria-label="Homepage">
          <a className="marketing-brand" href="#top" aria-label="Followthrough home">
            <BrandMark className="marketing-brand-icon" variant="icon" />
            <span className="marketing-brand-text">Followthrough</span>
          </a>
          <nav className="marketing-links" aria-label="Homepage links">
            <a href="#purpose">Purpose</a>
            <a href="#waitlist">Waitlist</a>
            <a href="#access">Sign in</a>
          </nav>
        </header>

        <div className="marketing-hero-content">
          <p className="marketing-eyebrow">
            Task management for teams that meet, decide, and then have to actually do things
          </p>
          <h1 id="marketing-heading">Followthrough keeps meeting promises from disappearing.</h1>
          <p className="marketing-intro">
            Capture meetings, decisions, owners, due dates, blockers, and reminders in one shared workspace so action items
            survive the gap between "sounds good" and "who was doing that again?"
          </p>
          <div className="marketing-actions">
            <a className="primary-button marketing-cta" href="#access">
              <span>Get into the workspace</span>
              <ArrowRight aria-hidden="true" size={18} />
            </a>
            <a className="secondary-button marketing-secondary-link" href="#purpose">
              See why it exists
            </a>
          </div>
        </div>
      </section>

      <section className="marketing-purpose" id="purpose" aria-labelledby="purpose-heading">
        <div className="marketing-purpose-copy">
          <p className="marketing-eyebrow">The point</p>
          <h2 id="purpose-heading">A quiet operating system for accountability.</h2>
          <p>
            Followthrough is built for small teams that need less performative project management and more dependable
            closure. It connects the notes from the meeting to the tasks, decisions, people, and alerts that make the work
            move after everyone leaves the room.
          </p>
        </div>
        <div className="marketing-proof-grid" aria-label="Followthrough capabilities">
          <article className="marketing-proof-card">
            <ListChecks aria-hidden="true" size={22} />
            <h3>Track the work</h3>
            <p>Standalone tasks and meeting tasks share owners, due dates, statuses, blockers, and searchable public IDs.</p>
          </article>
          <article className="marketing-proof-card">
            <CalendarCheck aria-hidden="true" size={22} />
            <h3>Keep meeting memory</h3>
            <p>
              Recurring meetings carry unfinished work forward so follow-up does not depend on someone heroic with a
              notebook.
            </p>
          </article>
          <article className="marketing-proof-card">
            <BellRing aria-hidden="true" size={22} />
            <h3>Nudge at the right time</h3>
            <p>Due-soon alerts and email reminders help teams act before the deadline turns into folklore.</p>
          </article>
          <article className="marketing-proof-card">
            <UsersRound aria-hidden="true" size={22} />
            <h3>Keep people shared</h3>
            <p>Assignees and attendees live in one people list, even when they do not need their own login.</p>
          </article>
          <article className="marketing-proof-card">
            <Search aria-hidden="true" size={22} />
            <h3>Find the thread</h3>
            <p>Global search reaches IDs, tasks, meetings, decisions, and people when memory gets optimistic.</p>
          </article>
          <article className="marketing-proof-card">
            <AlarmClockCheck aria-hidden="true" size={22} />
            <h3>Know what matters now</h3>
            <p>The dashboard highlights overdue work, active blockers, recent decisions, and the next useful action.</p>
          </article>
        </div>
      </section>

      <section className="marketing-access" id="access" aria-labelledby="access-heading">
        <div className="marketing-access-details">
          <div className="marketing-access-copy">
            <p className="marketing-eyebrow">Workspace access</p>
            <h2 id="access-heading">Enter your workspace or join with an invite code.</h2>
            <p>
              Followthrough is currently in private beta. Existing workspaces can sign in or create accounts with an
              invite code; everyone else can add their name and email to the waiting list.
            </p>
          </div>
        </div>
        <div className="marketing-access-panels">
          <section
            className={`auth-panel access-panel${accountPanelOpen ? " is-open" : ""}`}
            id="account-access"
            aria-labelledby="account-access-heading"
          >
            <h2 className="access-panel-heading">
              <button
                id="account-access-heading"
                className="access-panel-toggle"
                type="button"
                aria-expanded={accountPanelOpen}
                aria-controls="account-access-body"
                onClick={() => toggleAccessPanel("account")}
              >
                <span>Account access</span>
                <ChevronDown className="access-panel-chevron" aria-hidden="true" size={20} />
              </button>
            </h2>
            <div id="account-access-body" className="access-panel-body" hidden={!accountPanelOpen}>
              {mode === "forgot" ? (
                <form onSubmit={submitPasswordResetRequest} className="stack">
                  <FormField label="Email">
                    <input name="email" type="email" autoComplete="email" required />
                  </FormField>
                  {error ? <p className="form-error">{error}</p> : null}
                  {passwordResetStatus ? <p className="form-status">{passwordResetStatus}</p> : null}
                  <button
                    className="primary-button auth-submit-button"
                    disabled={passwordResetSubmitting}
                    type="submit"
                  >
                    <span>{passwordResetSubmitting ? "Sending..." : "Send reset link"}</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </form>
              ) : mode === "reset" ? (
                <form onSubmit={submitPasswordResetConfirm} className="stack">
                  <FormField label="New password">
                    <input name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
                  </FormField>
                  <FormField label="Confirm new password">
                    <input
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                    />
                  </FormField>
                  {error ? <p className="form-error">{error}</p> : null}
                  <button
                    className="primary-button auth-submit-button"
                    disabled={passwordResetSubmitting}
                    type="submit"
                  >
                    <span>{passwordResetSubmitting ? "Resetting..." : "Reset password"}</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </form>
              ) : (
                <form onSubmit={submit} className="stack">
                  {mode === "signup" ? (
                    <FormField label="Name">
                      <input name="name" autoComplete="name" required />
                    </FormField>
                  ) : null}
                  <FormField label="Email">
                    <input name="email" type="email" autoComplete="email" required />
                  </FormField>
                  <FormField label="Password">
                    <input
                      name="password"
                      type="password"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      required
                    />
                  </FormField>
                  {mode === "signup" ? (
                    <FormField label="Invite code">
                      <input name="inviteCode" required />
                    </FormField>
                  ) : null}
                  {error ? <p className="form-error">{error}</p> : null}
                  {passwordResetStatus ? <p className="form-status">{passwordResetStatus}</p> : null}
                  <button className="primary-button auth-submit-button" type="submit">
                    <span>{mode === "login" ? "Sign in" : "Create account"}</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </form>
              )}
              {mode === "login" ? (
                <button className="link-button" type="button" onClick={() => setMode("forgot")}>
                  Reset password
                </button>
              ) : null}
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setError(null);
                  setPasswordResetStatus(null);
                  setMode(mode === "login" ? "signup" : "login");
                }}
              >
                {mode === "login" ? "Use an invite code" : "Back to sign in"}
              </button>
            </div>
          </section>

          <section
            className={`waitlist-panel access-panel${waitlistPanelOpen ? " is-open" : ""}`}
            id="waitlist"
            aria-labelledby="waitlist-heading"
          >
            <h3 className="access-panel-heading">
              <button
                id="waitlist-heading"
                className="access-panel-toggle"
                type="button"
                aria-expanded={waitlistPanelOpen}
                aria-controls="waitlist-body"
                onClick={() => toggleAccessPanel("waitlist")}
              >
                <span>Join the waiting list</span>
                <ChevronDown className="access-panel-chevron" aria-hidden="true" size={20} />
              </button>
            </h3>
            <div id="waitlist-body" className="access-panel-body" hidden={!waitlistPanelOpen}>
              <p className="marketing-eyebrow">Private beta</p>
              <p>Leave your details and we will reach out when more beta spots are available.</p>
              <form onSubmit={submitWaitlist} className="waitlist-form">
                <FormField label="Your name">
                  <input name="waitlistName" autoComplete="name" required />
                </FormField>
                <FormField label="Email address">
                  <input name="waitlistEmail" type="email" autoComplete="email" required />
                </FormField>
                {waitlistError ? <p className="form-error">{waitlistError}</p> : null}
                {waitlistStatus ? (
                  <p className="form-status" aria-live="polite">
                    {waitlistStatus}
                  </p>
                ) : null}
                <button
                  className="primary-button waitlist-submit-button"
                  type="submit"
                  disabled={waitlistSubmitting}
                >
                  <span>{waitlistSubmitting ? "Joining..." : "Join waiting list"}</span>
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </form>
            </div>
          </section>
        </div>
      </section>

      <footer className="marketing-footer" aria-label="Site footer">
        <span>Followthrough</span>
        <span className="marketing-footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/changelog">Changelog</a>
        </span>
      </footer>
    </main>
  );
}
