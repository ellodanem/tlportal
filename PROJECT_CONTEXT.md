# TL Portal — project context log

Local, append-only log of **git commits** and **pushes** for Track Lucia / TL Portal.

- **Automation**: enable repo hooks once (see `README.md` → “Project context log”). Hooks append a short entry on each commit and each push.
- **Agents / contributors**: follow `.cursor/rules/project-context-log.mdc`. If hooks are not installed, append the same style of entry manually after committing or pushing.

**Do not delete or rewrite past entries.** New entries go at the **bottom**.

---

### 2026-04-09 — infrastructure (manual)

- Added `PROJECT_CONTEXT.md`, `.githooks/post-commit` + `pre-push`, `.cursor/rules/project-context-log.mdc` (`alwaysApply`), and `npm run hooks:install` to point Git at `.githooks`.

---

### 2026-04-09 20:24 UTC — commit `c3c04be`

- Scaffold TL Portal: Next.js, Prisma, auth, Invoiless/1NCE API stubs, Docker optional


### 2026-04-09 20:25 UTC — pre-push (`main` → origin) @ `c3c04be`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 20:28 UTC — commit `7c179b9`

- feat(admin): customers CRUD, admin layout, Invoiless customer sync


### 2026-04-09 20:28 UTC — pre-push (`main` → origin) @ `7c179b9`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 20:29 UTC — commit `fa588e2`

- fix(edge): middleware only imports jose + next/server for Vercel


### 2026-04-09 20:29 UTC — pre-push (`main` → origin) @ `fa588e2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 20:46 UTC — commit `7a59007`

- fix(auth): POST form + HTTPS-aware session cookie for LAN/http login


### 2026-04-09 20:46 UTC — pre-push (`main` → origin) @ `7a59007`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 20:52 UTC — commit `b67390a`

- fix(login): full-page nav to /admin after success; matcher + file debug logs


### 2026-04-09 20:52 UTC — pre-push (`main` → origin) @ `b67390a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 20:54 UTC — commit `7eb8ce2`

- fix(login): no native GET/POST to /login; allowedDevOrigins for LAN dev


### 2026-04-09 20:54 UTC — pre-push (`main` → origin) @ `7eb8ce2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 20:57 UTC — commit `b4e9be2`

- chore: gitignore debug session logs; sync PROJECT_CONTEXT


### 2026-04-09 20:57 UTC — pre-push (`main` → origin) @ `b4e9be2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 21:52 UTC — commit `9b104e4`

- Admin: dashboard, customer 360, SIMs, 1NCE import, create menu


### 2026-04-09 21:53 UTC — pre-push (`main` → origin) @ `9b104e4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:35 UTC — commit `01237d4`

- feat(admin): devices registry, register device flow, settings branding


### 2026-04-09 22:35 UTC — pre-push (`main` → origin) @ `01237d4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:36 UTC — commit `3792a1d`

- chore: sync PROJECT_CONTEXT after commit hook


### 2026-04-09 22:36 UTC — pre-push (`main` → origin) @ `3792a1d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:38 UTC — commit `515cdf4`

- chore: sync PROJECT_CONTEXT (hook output for 3792a1d)


### 2026-04-09 22:38 UTC — pre-push (`main` → origin) @ `515cdf4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:38 UTC — commit `066707a`

- chore: PROJECT_CONTEXT log for 515cdf4


### 2026-04-09 22:38 UTC — pre-push (`main` → origin) @ `066707a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:39 UTC — commit `f439b2b`

- chore: PROJECT_CONTEXT entries for 066707a


### 2026-04-09 22:39 UTC — pre-push (`main` → origin) @ `f439b2b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:39 UTC — commit `a5a6891`

- chore: PROJECT_CONTEXT for f439b2b


### 2026-04-09 22:39 UTC — pre-push (`main` → origin) @ `a5a6891`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:53 UTC — commit `811f4ec`

- feat(admin): device models, usage purpose, SIM est. MB/day, sidebar branding


### 2026-04-09 22:53 UTC — pre-push (`main` → origin) @ `811f4ec`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:53 UTC — commit `97d976b`

- chore: PROJECT_CONTEXT for 811f4ec


### 2026-04-09 22:53 UTC — pre-push (`main` → origin) @ `97d976b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:53 UTC — commit `e03fec4`

- chore: PROJECT_CONTEXT for 97d976b


### 2026-04-09 22:53 UTC — pre-push (`main` → origin) @ `e03fec4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:53 UTC — commit `3d96641`

- chore: PROJECT_CONTEXT for e03fec4


### 2026-04-09 22:54 UTC — pre-push (`main` → origin) @ `3d96641`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:54 UTC — commit `8f29605`

- chore: PROJECT_CONTEXT for 3d96641


### 2026-04-09 22:54 UTC — pre-push (`main` → origin) @ `8f29605`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:54 UTC — commit `3bec7af`

- chore: PROJECT_CONTEXT for 8f29605


### 2026-04-09 22:54 UTC — pre-push (`main` → origin) @ `3bec7af`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:54 UTC — commit `46d50cb`

- chore: PROJECT_CONTEXT for 3bec7af


### 2026-04-09 22:55 UTC — pre-push (`main` → origin) @ `46d50cb`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:55 UTC — commit `498b718`

- chore: PROJECT_CONTEXT for 46d50cb


### 2026-04-09 22:55 UTC — pre-push (`main` → origin) @ `498b718`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:55 UTC — commit `90e2bd2`

- chore: PROJECT_CONTEXT for 498b718


### 2026-04-09 22:55 UTC — pre-push (`main` → origin) @ `90e2bd2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:55 UTC — commit `2e3f902`

- chore: PROJECT_CONTEXT for 90e2bd2


### 2026-04-09 22:55 UTC — pre-push (`main` → origin) @ `2e3f902`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:55 UTC — commit `5bec5ca`

- chore: PROJECT_CONTEXT for 2e3f902


### 2026-04-09 22:55 UTC — pre-push (`main` → origin) @ `5bec5ca`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:56 UTC — commit `5c24fe5`

- chore: PROJECT_CONTEXT for 5bec5ca


### 2026-04-09 22:56 UTC — pre-push (`main` → origin) @ `5c24fe5`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 22:56 UTC — commit `3b3767b`

- chore: PROJECT_CONTEXT for 5c24fe5


### 2026-04-09 22:56 UTC — commit `c34f72a`

- chore: PROJECT_CONTEXT post-commit for 3b3767b


### 2026-04-09 23:05 UTC — commit `1cfdb4c`

- feat(admin): add All option to device/SIM purpose scope filter


### 2026-04-09 23:05 UTC — pre-push (`main` → origin) @ `1cfdb4c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 23:05 UTC — commit `99f7a8d`

- chore: sync PROJECT_CONTEXT after commit hook


### 2026-04-09 23:05 UTC — pre-push (`main` → origin) @ `99f7a8d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 23:05 UTC — commit `df2088c`

- chore: PROJECT_CONTEXT for 99f7a8d


### 2026-04-09 23:05 UTC — pre-push (`main` → origin) @ `df2088c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-09 23:05 UTC — commit `d63badf`

- chore: PROJECT_CONTEXT hook output


### 2026-04-09 23:05 UTC — pre-push (`main` → origin) @ `d63badf`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:14 UTC — commit `e2a8720`

- feat(admin): fleet chart, device lifecycle, customer fields, Invoiless sync


### 2026-04-10 11:14 UTC — pre-push (`main` → origin) @ `e2a8720`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:14 UTC — commit `8c4ce5e`

- chore: PROJECT_CONTEXT for e2a8720


### 2026-04-10 11:14 UTC — pre-push (`main` → origin) @ `8c4ce5e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:15 UTC — commit `73bfbff`

- chore: PROJECT_CONTEXT for 8c4ce5e


### 2026-04-10 11:15 UTC — pre-push (`main` → origin) @ `73bfbff`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:15 UTC — commit `bd012a1`

- chore: PROJECT_CONTEXT for 73bfbff


### 2026-04-10 11:15 UTC — pre-push (`main` → origin) @ `bd012a1`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:16 UTC — commit `b4aba9e`

- chore: PROJECT_CONTEXT after bd012a1


### 2026-04-10 11:16 UTC — pre-push (`main` → origin) @ `b4aba9e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:16 UTC — commit `2cd28df`

- chore: PROJECT_CONTEXT for b4aba9e


### 2026-04-10 11:16 UTC — pre-push (`main` → origin) @ `2cd28df`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:17 UTC — commit `20a654e`

- chore: PROJECT_CONTEXT for 2cd28df


### 2026-04-10 11:17 UTC — pre-push (`main` → origin) @ `20a654e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:17 UTC — commit `8b21874`

- chore: PROJECT_CONTEXT for 20a654e


### 2026-04-10 11:17 UTC — pre-push (`main` → origin) @ `8b21874`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:17 UTC — commit `f0b2dd6`

- chore: PROJECT_CONTEXT for 8b21874


### 2026-04-10 11:17 UTC — pre-push (`main` → origin) @ `f0b2dd6`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:18 UTC — commit `5d55c7d`

- fix: remove localhost debug fetch from admin middleware


### 2026-04-10 11:18 UTC — pre-push (`main` → origin) @ `5d55c7d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:19 UTC — commit `524f8b0`

- chore: PROJECT_CONTEXT for 5d55c7d


### 2026-04-10 11:19 UTC — pre-push (`main` → origin) @ `524f8b0`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:32 UTC — commit `695a367`

- feat: fleet snapshot by segment; device object types; SMTP settings


### 2026-04-10 11:32 UTC — pre-push (`main` → origin) @ `695a367`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 11:32 UTC — commit `b2db335`

- chore: PROJECT_CONTEXT for 695a367


### 2026-04-10 11:32 UTC — pre-push (`main` → origin) @ `b2db335`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 12:19 UTC — commit `484b3d7`

- feat(admin): Vercel Blob for branding logo on serverless; doc env token


### 2026-04-10 12:20 UTC — pre-push (`main` → origin) @ `484b3d7`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 12:23 UTC — commit `8289953`

- chore: PROJECT_CONTEXT for 484b3d7


### 2026-04-10 12:23 UTC — pre-push (`main` → origin) @ `8289953`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 12:57 UTC — commit `570ee8f`

- perf(sims): parallel 1NCE API calls on SIM detail; index usedDataMB


### 2026-04-10 12:58 UTC — pre-push (`main` → origin) @ `570ee8f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 16:30 UTC — commit `e71ac22`

- feat(admin): TL Portal billing ledger UI for invoices


### 2026-04-10 16:30 UTC — commit `5ac1a18`

- feat(admin): TL Portal billing ledger UI for invoices


### 2026-04-10 16:31 UTC — pre-push (`main` → origin) @ `5ac1a18`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 16:36 UTC — commit `d3a9589`

- fix(admin): drop ledger wording on invoices page


### 2026-04-10 16:37 UTC — pre-push (`main` → origin) @ `d3a9589`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 16:42 UTC — commit `bc64cad`

- fix(admin): open Invoiless new invoice at app create URL


### 2026-04-10 16:42 UTC — pre-push (`main` → origin) @ `bc64cad`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-10 17:01 UTC — pre-push (`main` → origin) @ `7971634`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).

### 2026-04-10 — feat(billing): wire Invoiless recurring ID to service assignments — `7971634`

- **Agent notes** — Option B billing integration hardening (Steps 2, 3, 5):
- `components/admin/device-service-assignment-edit-form.tsx` — added **Invoiless recurring ID** text field; saving writes `invoilessRecurringId` to the assignment row.
- `app/admin/devices/actions.ts` (`updateServiceAssignmentDates`) — parses and persists `invoilessRecurringId` (clear field to unlink).
- `app/admin/devices/[id]/edit/page.tsx` — passes `defaultInvoilessRecurringId` prop; uses `select` instead of `include` for the open assignment query so new field is available.
- `app/admin/customers/[id]/page.tsx` — service history table gains a **Billing** column: green "↻ Linked" badge (tooltip shows ID) when recurring is linked, dash otherwise; last payment status shown beneath when present.


### 2026-04-10 17:03 UTC — pre-push (`main` → origin) @ `45fa4c5`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).

### 2026-04-10 — feat(devices): sortable Status and Assigned To columns — `45fa4c5`

- **Agent notes** — `components/admin/devices-table-client.tsx`:
- Status and Assigned To column headers are now clickable sort buttons with a `↑`/`↓` indicator.
- Click once to sort ascending; click again to toggle descending.
- Status sort uses a logical sequence: assigned → in stock → suspended → returned → decommissioned → lost.
- Assigned To sort is alphabetical by display name; unassigned devices always sort to the bottom.
- All sorting is client-side (no server round-trip); works alongside the existing search and purpose-scope filters.


### 2026-04-10 17:59 UTC — pre-push (`main` → origin) @ `cb1cced`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-11 10:36 UTC — commit `603fc8c`

- feat(cron): nightly 1NCE SIM import at ~AST midnight
- **Agent notes** — `lib/admin/one-nce-sims-sync.ts` (shared import + single-SIM sync + revalidate); `app/api/cron/nightly-sims-sync/route.ts` (GET, `Authorization: Bearer CRON_SECRET`, `maxDuration` 300); `vercel.json` cron `5 4 * * *` (04:05 UTC ≈ 00:05 AST); `app/admin/sims/actions.ts` delegates to lib; `.env.example` + `README.md` document `CRON_SECRET`.


### 2026-04-11 10:36 UTC — pre-push (`main` → origin) @ `603fc8c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).

