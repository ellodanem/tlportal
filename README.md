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

   ```bash
   npm install
   npm run db:deploy
   ```

   For interactive dev with a live DB, `npm run db:migrate` still works. **Seed** an admin user (optional):

   ```bash
   npm run db:seed
   ```

   Requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, plus `AUTH_SECRET` (≥32 characters).

3. Run the app:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000). **Admin**: [http://localhost:3000/login](http://localhost:3000/login) (after seed). **Health**: [http://localhost:3000/api/health](http://localhost:3000/api/health).

### API stubs (server-side env required)

| Route | Purpose |
| ----- | ------- |
| `GET /api/health` | DB connectivity |
| `GET /api/integrations/invoiless/customers` | Invoiless customers (`INVOILESS_API_KEY`) |
| `GET /api/integrations/invoiless/invoices` | Invoiless invoices |
| `GET /api/integrations/once/sims` | 1NCE SIM list (`ONCE_CLIENT_ID` / `ONCE_CLIENT_SECRET`) |

Without keys, these return **503** with `configured: false`.

## Scripts

| Script            | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Development server       |
| `npm run build`   | Production build         |
| `npm run db:migrate` | Prisma migrate dev    |
| `npm run db:deploy` | `prisma migrate deploy` (CI/prod) |
| `npm run db:seed` | Seed admin user (`ADMIN_*` in `.env`) |
| `npm run db:push` | Push schema (prototyping) |
| `npm run db:studio` | Prisma Studio         |
| `npm run docker:up` / `docker:down` | Local Postgres (Docker) |

## Deploy (Vercel)

Import the repo, set `DATABASE_URL` and other secrets in the Vercel project settings. The `postinstall` script runs `prisma generate` on each deploy.

## Project context log

**`PROJECT_CONTEXT.md`** is an append-only local log of commits and pushes. Cursor is configured (`.cursor/rules/project-context-log.mdc`) to keep it updated when you work in this repo.

**Automated logging (recommended once per clone):**

```bash
npm run hooks:install
```

That sets `core.hooksPath` to `.githooks` so `post-commit` and `pre-push` append timestamps and subjects to `PROJECT_CONTEXT.md`. If hooks are not installed, append entries manually after commit/push (same rule file applies).
