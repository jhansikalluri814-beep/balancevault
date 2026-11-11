# BalanceVault threat notes

## Scope

This is a hackathon demonstration for synthetic data. It is not a financial service and does not move or hold money. The browser calls an Express API; the API authenticates users and uses PostgreSQL for accounts, onboarding requests, and audit events. Redis stores shared authentication rate limits when `REDIS_URL` is configured.

## Assets and trust boundaries

- Passwords and session tokens
- Holder account access and onboarding decisions
- Admin privileges and the audit history
- PostgreSQL and Redis credentials
- Browser-to-API requests across the configured frontend origin

The browser is untrusted. Every admin route checks the server-side role. The database and environment secrets are trusted only within the configured deployment. Local development permits HTTP and in-memory rate limits; production must use HTTPS and Redis.

## Threats, controls, and residual risk

| Threat | Current control | Remaining risk |
| --- | --- | --- |
| Guess or reuse a password to take over an account | bcrypt password hashes; 30 requests per 15 minutes on auth routes; Redis-backed counters in production | No MFA, password reset, or breached-password screening |
| Forge a session or read its token from browser JavaScript | Signed 8-hour JWT in an HTTP-only cookie; server reloads the user and rejects disabled accounts | No refresh-token rotation or immediate token revocation beyond the database account check |
| Call an admin endpoint as a holder | Every admin route uses `requireUser` and `requireAdmin` | Route coverage must stay in sync as endpoints are added |
| Submit a cross-site state-changing request | Exact `Origin` check on mutating `/api` requests; `SameSite` cookie setting | Cross-site deployments may be affected by browser third-party-cookie rules; prefer same-site hosts |
| Approve one onboarding request twice during a race | Conditional `PENDING` update in a transaction; decision and audit event commit together | Database outages can still interrupt the request; clients must handle retries |
| Keep access after an admin disables a holder | Each authenticated request reloads the user and checks `disabled` | Existing in-flight requests can finish |
| Disable an administrator accidentally through user management | Admin user status endpoint refuses administrator targets | Direct database operators can still change roles or status |
| Brute-force auth routes across multiple API instances | Redis store is required at production startup; local development uses in-memory fallback | Redis availability and ACL/TLS configuration must be monitored |
| Tamper with audit history | Admin UI exposes read-only audit access; sensitive actions create audit rows in their database transaction | The audit table is not cryptographically tamper-evident; a privileged database operator can alter it |
| Leak personal or financial data | UI warns to use synthetic data; API avoids returning password hashes; project has no funds or balances | Registration stores name and email; use only synthetic data for this demo |

## Local security smoke check

With migrations applied, an admin bootstrapped, and the API running locally, run:

```powershell
npm --prefix api run smoke:security
```

The script refuses non-local databases, creates a temporary `example.test` holder, checks admin login, unauthenticated and holder authorization denial, cross-origin mutation denial, onboarding approval, disable/restore behavior, protected admin status, and audit entries, then deletes the temporary holder and related events. It requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `api/.env`.

The smoke check exercises the local app only. It does not test cloud hosting, browser third-party-cookie behavior, Redis outage recovery, or database role separation.
