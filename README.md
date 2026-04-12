# TL Portal

Admin portal for **Track Lucia**: customers, device inventory, 1NCE SIM sync, and Invoiless billing.

## Stack

- Next.js (App Router), React, TypeScript, Tailwind CSS
- Prisma + PostgreSQL
- Auth-ready: `jose`, `bcryptjs` (wire routes when needed)
- Integrations: Invoiless API, 1NCE Management API (implement in server code)

## Setup

1. Copy environment file and fill values:
  ```bash
   copy .env.example .env
  ```
2. Set `DATABASE_URL` in `.env` (see `.env.example`). For **local Docker**:
  ```bash
   npm run docker:up
  ```
   Then apply migrations (creates tables from `prisma/migrations/`):
   For interactive dev with a live DB, `npm run db:migrate` still works. **Seed** an admin user (optional):
   Requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, plus `AUTH_SECRET` (≥32 characters).
3. Run the app:
  ```bash
   npm run dev
  ```

Open [http://localhost:3000](http://localhost:3000). **Admin**: [http://localhost:3000/login](http://localhost:3000/login) (after seed). **Health**: [http://localhost:3000/api/health](http://localhost:3000/api/health).

### API stubs (server-side env required)


| Route                                       | Purpose                                                 |
| ------------------------------------------- | ------------------------------------------------------- |
| `GET /api/health`                           | DB connectivity                                         |
| `GET /api/integrations/invoiless/customers` | Invoiless customers (`INVOILESS_API_KEY`)               |
| `GET /api/integrations/invoiless/invoices`  | Invoiless invoices                                      |
| `GET /api/integrations/once/sims`           | 1NCE SIM list (`ONCE_CLIENT_ID` / `ONCE_CLIENT_SECRET`) |


Without keys, these return **503** with `configured: false`.

### Admin UI (product)

- `**/admin`** — dashboard.
- `**/admin/customers**` — list, create, edit, delete customers; optional **Invoiless sync** when `INVOILESS_API_KEY` is set (default currency `XCD`, override with `INVOILESS_DEFAULT_CURRENCY`).

## Scripts


| Script                              | Description                           |
| ----------------------------------- | ------------------------------------- |
| `npm run dev`                       | Development server                    |
| `npm run build`                     | Production build                      |
| `npm run db:migrate`                | Prisma migrate dev                    |
| `npm run db:deploy`                 | `prisma migrate deploy` (CI/prod)     |
| `npm run db:seed`                   | Seed admin user (`ADMIN_*` in `.env`) |
| `npm run db:push`                   | Push schema (prototyping)             |
| `npm run db:studio`                 | Prisma Studio                         |
| `npm run docker:up` / `docker:down` | Local Postgres (Docker)               |


## Deploy (Vercel)

Import the repo, set `DATABASE_URL` and other secrets in the Vercel project settings.

**Neon + Prisma migrate:** add **`DIRECT_URL`** in Vercel (and `.env` locally if you use Neon). Use Neon’s **direct** connection string (host **without** `-pooler`) for `DIRECT_URL`, and keep the **pooled** URL as `DATABASE_URL` for runtime. `prisma.config.ts` passes `directUrl` into `migrate deploy` so advisory locks are not taken on the pooler (see [Prisma — Neon](https://www.prisma.io/docs/orm/overview/databases/neon)). The build script sets `DIRECT_URL` to `DATABASE_URL` only when `DIRECT_URL` is unset (OK for Docker; **on Neon you should set both explicitly**).

`postinstall` runs `prisma generate`. **`npm run build`** runs `node scripts/run-build.mjs` (`prisma migrate deploy` → `prisma generate` → `next build`). During migrate, when `DIRECT_URL` is set, the script temporarily sets `DATABASE_URL` to that value so deploy never runs on the pooler; transient **P1002** / advisory-lock timeouts are retried a few times with backoff (Prisma’s lock wait is not configurable beyond that).

**Prisma P1002 (migrate advisory lock) keeps failing on Vercel:** Prisma takes an exclusive session advisory lock so only one `migrate deploy` runs at a time. The wait is **fixed at about 10 seconds**; if anything else is already holding that lock, or the connection path cannot complete the lock reliably, **every retry fails the same way** until the holder finishes. Common causes: **two deploys at once** (production + preview, or two previews) hitting the **same** database; **`prisma migrate dev`** or **Studio** left open against prod; **pooler** URLs (host contains `-pooler` or `pgbouncer=true`) without a separate **`DIRECT_URL`**. Mitigations: use Neon **direct** `DIRECT_URL`; avoid parallel deploys against one DB; terminate stray backends in Neon **SQL Editor** if a session is stuck. On **`VERCEL=1`**, the build script sets **`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`** for the migrate step only (Prisma’s supported workaround) so deploys are not blocked by the lock — **unsafe if two `migrate deploy` processes run concurrently on the same schema**; use preview databases per branch, or set **`TLPORTAL_KEEP_MIGRATE_ADVISORY_LOCK=1`** to keep the lock and rely on `DIRECT_URL` + single-flight deploys instead. To **skip migrate in the Vercel build** and run it in CI instead, set **`SKIP_PRISMA_MIGRATE_ON_BUILD=1`**.

**Prisma P3009 (failed migration `20260412104500_subscription_option_duration_price`):** a previous `migrate deploy` can leave that migration marked **failed**, so new deploys stop. In Neon **SQL Editor**, run `docs/repair-p3009-subscription-option-migration.sql` (it drops `NOT NULL` on legacy `label` / `sortOrder` before inserting, so the script works when the old columns are still present). Then run `npm run db:resolve:subscription-migration-applied` with `DATABASE_URL` / `DIRECT_URL` pointing at that DB. **Do not** keep Neon “AI fixes” that reintroduce `label` on inserts — production schema has no `label`. If the schema was **already fully updated**, skip the SQL and only run `resolve --applied`. See [Prisma: production troubleshooting](https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting-development).

**Nightly SIM sync:** set `CRON_SECRET` (long random string) in the project environment. `vercel.json` schedules `GET /api/cron/nightly-sims-sync` at **04:05 UTC** (about **00:05 AST**, Barbados / St Lucia, UTC−4). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Self-hosted: call the same URL on the same schedule with that header.

**SIM usage range:** On `/admin/sims/{id}`, optional query `usageFrom` and `usageTo` (`YYYY-MM-DD`, UTC calendar) set the 1NCE usage window (max **183** inclusive days). Omit both for the default (~181-day) window.

**Public registration:** `/register` (not under `/admin`). Staff set **XCD prices** (Eastern Caribbean dollars) for the four fixed plans (1 / 3 / 6 / 12 month) under **Settings → Plans** (`/admin/subscription-options`), review submissions under **Registrations** (`/admin/registration-requests`). Approve creates a `Customer` with snapshot notes and tag `from-registration`; Invoiless is still a separate step. Run `npm run db:seed` once if you need a default admin user; empty plan rows are filled automatically when you open Plans or `/register`.

**Branding / Vercel Blob:** set `BLOB_READ_WRITE_TOKEN` from the Blob store. Logo upload uses a Server Action; `next.config.ts` raises `experimental.serverActions.bodySizeLimit` so files up to **2 MB** are not rejected by the default **~1 MB** multipart limit — **redeploy** after changing that config.

## Project context log

`**PROJECT_CONTEXT.md`** is an append-only local log of commits and pushes. Cursor is configured (`.cursor/rules/project-context-log.mdc`) to keep it updated when you work in this repo.

**Automated logging (recommended once per clone):**

```bash
npm run hooks:install
```

That sets `core.hooksPath` to `.githooks` so `post-commit` and `pre-push` append timestamps and subjects to `PROJECT_CONTEXT.md`. If hooks are not installed, append entries manually after commit/push (same rule file applies).