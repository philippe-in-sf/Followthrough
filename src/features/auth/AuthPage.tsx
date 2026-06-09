import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import type { User } from "../../api/types";
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
    <main className="auth-page">
      <section className="auth-panel">
        <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
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
          <button className="primary-button" type="submit">
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          className="link-button"
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Use an invite code" : "Back to sign in"}
        </button>
      </section>
    </main>
  );
}
