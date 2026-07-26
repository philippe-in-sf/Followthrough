# Security audit response — July 24, 2026

This document records the disposition of the eleven findings in `audit.txt`.

## Implemented

1. **Google OAuth tokens at rest:** Access and refresh tokens are encrypted with
   AES-256-GCM, authenticated to the owning user and token field, migrated on
   startup, and support key rotation.
2. **React Router advisories:** Followthrough did not import or use React Router,
   so the unused `react-router-dom` dependency and its transitive `react-router`
   package were removed. The production dependency audit now reports zero
   vulnerabilities. Pull requests continue to surface `npm audit`.
3. **Content Security Policy:** Helmet sends a nonce-based CSP. GTM, Cookiebot,
   the server-rendered pages, and every SPA delivery path receive a unique
   response nonce.
4. **CSRF no-Origin gap:** Production rejects all state-changing requests that
   omit `Origin`. Cross-origin requests remain blocked and the session cookie
   remains `SameSite=Lax` for the Google OAuth return flow.
5. **Authentication timing:** Unknown-user logins perform the same scrypt work
   as wrong-password logins. Password-reset requests have a randomized response
   floor and do not wait for SMTP completion; delivery failures retain the same
   public response.
7. **Session staleness:** Sessions have an inactivity expiry and fixed maximum
   lifetime. Tokens are rotated or revoked at login, password, role, team, and
   impersonation boundaries.
8. **Expired auth records:** A startup and periodic cleanup deletes expired or
   inactive sessions, expired OAuth states, and expired or used reset tokens.
   Cleanup columns are indexed.
9. **Secret and process hardening:** Deployment makes `.env` root-owned mode
   `0600`, secures configured data paths, and adds systemd sandboxing and a
   restrictive umask.
10. **Backup protection:** Built-in backups require a dedicated key and are
    streamed to authenticated AES-256-GCM ciphertext in a mode `0700`
    directory. Existing plaintext snapshots are encrypted before the backup job
    continues. Rotation and an authenticated restore command are included.
    Deployment refuses to invent a replacement key when encrypted snapshots
    already exist.

## Qualified or deferred decisions

3. **Compromised trusted scripts:** CSP materially constrains future injection
   bugs, but it cannot make an explicitly trusted, compromised GTM or Cookiebot
   script harmless. Those vendors retain the privileges required to perform
   their configured work; minimizing tags and vendor access remains an
   operational control.
4. **SameSite=Strict and CSRF tokens:** `SameSite=Strict` would prevent the
   authenticated Google OAuth callback from receiving its session cookie. With
   host-only `SameSite=Lax` cookies, enforced same-origin checks, fail-closed
   no-Origin handling, and OAuth state verification, a second CSRF token is not
   currently justified.
6. **Automatic account lockout:** Email- and IP-keyed throttles remain the
   primary brute-force control. A public per-account lockout would let an
   attacker deny service to any known user. Add lockout only with an unlock
   design, monitoring, and a product decision about that availability tradeoff.
9. **Secrets manager:** The deployment now enforces strong file permissions,
   but moving secrets to systemd credentials or an external secrets manager is
   an infrastructure project rather than a repository-only patch.
11. **Breached-password API:** The existing twelve-character minimum remains.
   A remote breached-password lookup adds availability and privacy dependencies.
   Prefer adding MFA before making login or reset depend on another external
   service.

## Production observations and deployment checks

- The active production database is under `/var/lib/task-manager`, not the
  newer shared-data default under `/opt`.
- Before this release, the active data and backup directories were mode `0755`,
  the database and backup files were mode `0644`, and fourteen retained backups
  were plaintext.
- The existing `.env` was already mode `0600`.
- Apache uses `mod_proxy` without disabling `ProxyAddHeaders`; its documented
  default supplies the `X-Forwarded-*` headers consumed through Express's
  loopback-only proxy trust.

After deployment:

1. Confirm the OAuth and backup encryption keys are present without printing
   their values.
2. Confirm the service starts and all legacy `.sqlite` backups become
   `.sqlite.enc`.
3. Confirm `.env` is `0600`, configured data directories are `0700`, and the
   database, manifest, and backup files are `0600`.
4. Perform a restore drill with `npm run backup:decrypt`.
5. Verify a new Admin login event records the public client IP rather than the
   loopback proxy address.

## Additional recommendation

Prioritize MFA for administrators and the owner account. It provides a larger
reduction in credential-stuffing risk than hard account lockout or a remote
breached-password check, without exposing every known account to trivial
lockout denial of service.

Add a focused authorization regression matrix for every team-owned resource:
member, other member's private record, same-team shared record, and cross-team
record, across read and mutation routes. The audit found the query patterns
consistent, but tests are cheaper than discovering one missing team predicate
after a future route is added.

Keep an encrypted copy of backups off-host and escrow the backup key separately
from the server. Local encryption limits disclosure, but a single-disk failure
can still destroy both the database and every local snapshot.
