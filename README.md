# BalanceVault starter

An original hackathon starter for account registration, role-based admin access, onboarding review, and an audit trail. It uses synthetic demo data and is not a financial service.

## Requirements

- Node.js 20 or newer
- PostgreSQL

## Run locally

1. Copy `api/.env.example` to `api/.env`; set a local PostgreSQL `DATABASE_URL` and `MIGRATION_DATABASE_URL` (they may be the same local URL) and a unique `JWT_SECRET` of at least 32 characters. Leave `REDIS_URL` empty for local development unless you have Redis running.
   - Create a PostgreSQL database named `balancevault` and a matching user/password, or use the default `postgres` role if that is your local setup. Replace `YOUR_POSTGRES_PASSWORD`; do not leave the placeholder in place.
   - The database URL must match the username/password of an existing PostgreSQL role; if Prisma reports `P1000`, the credentials are wrong or the role does not exist.
2. From this directory, install each package's dependencies:
   `npm install`
   `npm --prefix api install`
   `npm --prefix web install`
3. Run `npm run db:generate`, then `npm run db:migrate`.
4. Set `ADMIN_EMAIL`, `ADMIN_NAME`, and a strong `ADMIN_PASSWORD` in `api/.env` for the initial administrator.
5. Run `npm run bootstrap:admin` once. Keep local admin credentials only in the ignored `api/.env` file if you need the smoke check or credential-rotation command; never commit them.
6. Copy `web/.env.example` to `web/.env` if you need to change the API address. Run `npm run dev`. The web app is at `http://localhost:5173`; the API is at `http://localhost:4000`.
7. With the API running and an admin configured, verify the local account and authorization flow using `npm --prefix api run smoke:security`.

Set `WEB_ORIGIN` to the exact frontend origin and `VITE_API_URL` to the API origin when deploying. Production uses a Secure, HTTP-only cookie with `SameSite=None` for separately hosted frontend/API domains; mutating API routes also check the exact `Origin`. HTTPS is required, and third-party cookie blocking may still prevent cross-site login, so same-site custom domains are preferable. Keep database credentials, signing secrets, and bootstrap credentials out of source control. Do not enable public repository visibility before the deadline; the event instructions appear to conflict on repository visibility, so ask the placement cell.

For a fresh PostgreSQL deployment, create runtime and migration roles using `api/prisma/roles.postgresql.sql`, then set `DATABASE_URL` to the restricted `balancevault_app` URL and `MIGRATION_DATABASE_URL` to `balancevault_migrator`. Apply deployed migrations with `npm run db:deploy`; do not use the development `db:migrate` command in production.

To change an existing admin's email/name/password, update the `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` values in the ignored `api/.env` file, then run `npm run admin:rotate` once. This updates the existing administrator in the database; editing `.env` alone does not change the stored password hash. Change `JWT_SECRET` too if you need to invalidate existing sessions.

## Included

- Holder registration automatically creates a pending onboarding request.
- Login uses a password hash and an HTTP-only session cookie.
- Admin endpoints require the authenticated `ADMIN` role on every request.
- Admins can view users and disable or restore holder accounts; administrator accounts are protected from that action.
- Initial administrator setup is a one-time CLI command, not a public HTTP endpoint.
- Onboarding decisions and sign-ins are written to an audit table.
- Auth rate limiting uses Redis when `REDIS_URL` is configured; local development falls back to the in-memory store. Production startup requires Redis.
- `/health` and `/ready` provide process and database/Redis readiness checks.

## Still to do before claiming a complete submission

This starter has not been verified against your live hosting environment or browser. The Prisma runtime and migration URLs are separate, but a production deployment still needs dedicated PostgreSQL roles and grants; a local SQL template is in `api/prisma/roles.postgresql.sql`. The starter does not include account balances or money movement, password reset, or operational monitoring. Add and verify those according to the actual problem requirements. Review and understand each authorization path yourself before deployment. See `THREATS.md` for threat assumptions and the local security smoke command.

The current Prisma CLI dependency tree still reports three high-severity npm audit findings through `@prisma/config` and `deepmerge-ts`. `npm audit fix` did not resolve them within the configured Prisma 6 dependency range. Review the advisory and plan a compatible Prisma upgrade before treating this as production-ready.

Do not copy fictional work dates or commit links into `PROMPTS.md`. Add dated entries as you actually work, include the exact prompt, what the tool produced, what you found wrong, what you changed, and the real commit link. Keep your own genuine commit history; do not rewrite history to simulate earlier work.
