# AI use log

Add entries as work happens. Keep the prompt and correction specific, and add the real commit URL after you make the corresponding commit. Do not backdate entries or invent commit links.

## 2026-11-10 — BalanceVault starter implementation

- **Tool and prompt:** OpenAI Codex, asked to provide code for the BalanceVault project described in the conversation: React frontend, Node API, Prisma/PostgreSQL, registration/login, role checks, onboarding review, audit events, and a first-admin bootstrap.
- **What the tool produced:** A new starter project with a React dashboard, Express API routes, Prisma schema, and one-time CLI admin bootstrap.
- **What needed correction or verification:** The workspace did not contain the original source repository, so this is a standalone starter rather than a patch to the existing app. The first npm install attempt failed on Windows workspace symlink permissions; package setup was changed to install each package separately. Review found that the initial bootstrap check could race if two operators ran it together, and `SameSite=Strict` would block cookies when separately hosted frontend/API domains are cross-site. Both were corrected using a PostgreSQL advisory lock and exact-origin checks for state-changing API calls. A dependency audit reported high severity findings in the installed Prisma/Zod dependency tree. The generated code has not been checked against the live database, deployed environment, or actual authorization threat tests.
- **What I did:** Built the frontend production bundle and generated the Prisma client. I have not claimed live authentication or admin bootstrap as verified. Review the code, address the dependency audit findings, then commit your own reviewed changes and add the actual commit link here.
- **Commit:** Not yet committed.

## 2026-11-11 — Complete the local admin workflow

- **Tool and prompt:** OpenAI Codex, asked to complete the BalanceVault project based on the submitted feature summary and reported that local registration worked.
- **What the tool produced:** Added a user-management screen and protected API actions to disable or restore holder accounts. Added transaction boundaries for registration and conditional updates to prevent two admins from reviewing one request at the same time. Replaced the browser's generic network error with API-origin guidance. Added Redis-backed auth rate limiting when `REDIS_URL` is set; local development keeps an in-memory fallback and production now requires Redis. Split the runtime and migration database URLs and added a PostgreSQL role-grant template for fresh databases.
- **What needed correction or verification:** Package installation exposed a peer-version conflict between `rate-limit-redis` and the existing `express-rate-limit` version; I upgraded the limiter to a compatible version and refreshed the lockfile. An npm audit still reports three high-severity findings in the Prisma CLI dependency chain; this needs review before deployment. Redis is not configured in the local environment, so the Redis-backed production path is not exercised.
- **What I did:** Updated the implementation and README, built the frontend bundle, and ran JavaScript syntax checks. Prisma schema validation passed and the local database reported its migration state up to date. A local security smoke check passed admin login, holder registration, onboarding approval, holder disable/restore, audit events, unauthenticated and role denials, cross-origin mutation denial, and protection of administrator status. The smoke script cleaned up its synthetic account. No repository remote was available, so there is no commit link yet. Review the changes and commit them yourself to keep your work history accurate.
- **Commit:** Not yet committed.

## 2026-11-10 — Diagnose missing Prisma environment variable

- **Tool and prompt:** OpenAI Codex, asked for a solution to the `P1012` Prisma schema error shown in a screenshot.
- **What the tool produced:** Guidance to create `api/.env` from the example file and put `DATABASE_URL` in that file.
- **What was wrong:** An earlier answer presented the `DATABASE_URL=...` assignment as though it could be typed directly into PowerShell. PowerShell treated it as a command and failed.
- **What I did:** Clarified that it belongs in `api/.env`, not the terminal. The database migration later reached the local database.
- **Commit:** Not yet committed.

## 2026-11-11 — Diagnose browser API connection failure

- **Tool and prompt:** OpenAI Codex, asked for an answer to the browser screenshot showing “Failed to fetch” at `10.16.50.18:5173`.
- **What the tool produced:** Compared the browser origin with the local API CORS setting and suggested opening the app at `http://localhost:5173` on the same computer.
- **What needed verification:** A failed fetch alone could also mean the API process was down. The API health endpoint needed to respond before treating the origin mismatch as the cause.
- **What I did:** The app was subsequently shown running at `localhost:5173`, and the API health/readiness checks passed locally.
- **Commit:** Not yet committed.

## 2026-11-11 — Complete and verify admin access controls

- **Tool and prompt:** OpenAI Codex, asked to complete the BalanceVault project and its unfinished admin and onboarding workflows.
- **What the tool produced:** Admin user listing and holder disable/restore actions, onboarding review, Redis-backed auth rate limiting when configured, runtime/migration URL separation, and a security smoke script.
- **What needed verification:** The source summary did not define money movement requirements, and the live deployment and Redis service were unavailable for verification. I did not claim those flows work.
- **What I did:** Ran a local smoke check using a temporary synthetic account. Admin login, holder registration, pending onboarding, approval, role denials, cross-origin mutation denial, disable/restore, and audit events passed; the smoke test removed its temporary account.
- **Commit:** Not yet committed.

## 2026-11-11 — Rotate an existing admin safely

- **Tool and prompt:** OpenAI Codex, asked how to change the database, JWT, origin, and admin settings in `api/.env` after sharing the current values.
- **What the tool produced:** A local CLI command that updates the existing admin's email, name, and password hash from the ignored `.env` file, plus setup documentation.
- **What needed correction or verification:** Changing `ADMIN_PASSWORD` in `.env` by itself does not update the password hash stored in PostgreSQL. I have not run the rotation because the user must choose a new private credential first.
- **What I did:** Added `npm run admin:rotate`; it changes only the existing first admin and writes an audit event. Syntax/build verification is still pending.
- **Commit:** Not yet committed.
