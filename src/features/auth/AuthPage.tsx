import { type FormEvent, useState } from "react";
import {
  AlarmClockCheck,
  ArrowRight,
  BellRing,
  CalendarCheck,
  ListChecks,
  Search,
  UsersRound,
} from "lucide-react";
import { api } from "../../api/client";
import type { User } from "../../api/types";
import { BrandMark } from "../../components/BrandMark";
import { FormField } from "../../components/FormField";

export function AuthPage({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);

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
            <span className="app-mark marketing-brand-mark">
              <BrandMark />
            </span>
            <span>Followthrough</span>
          </a>
          <nav className="marketing-links" aria-label="Homepage links">
            <a href="#purpose">Purpose</a>
            <a href="#access">Sign in</a>
            <a href="/privacy">Privacy</a>
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
        <div className="marketing-access-copy">
          <p className="marketing-eyebrow">Workspace access</p>
          <h2 id="access-heading">Enter your workspace or join with an invite code.</h2>
          <p>
            Followthrough is private by default. Create an account only when someone on the team has shared an invite code
            with you.
          </p>
        </div>
        <section className="auth-panel" aria-label="Account access">
          <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
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
            <button className="primary-button auth-submit-button" type="submit">
              <span>{mode === "login" ? "Sign in" : "Create account"}</span>
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </form>
          <button
            className="link-button"
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Use an invite code" : "Back to sign in"}
          </button>
          <div className="auth-legal-links">
            <a className="auth-changelog-link" href="/changelog">
              View changelog
            </a>
            <a className="auth-changelog-link" href="/privacy">
              Privacy policy
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}
