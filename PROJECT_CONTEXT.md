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


### 2026-04-11 10:36 UTC — commit `b474e4e`

- docs: expand PROJECT_CONTEXT for nightly SIM cron commit


### 2026-04-11 10:36 UTC — pre-push (`main` → origin) @ `b474e4e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-11 23:19 UTC — commit `0898050`

- feat(register): public registration queue and subscription plans CRUD
- **Agent notes** — Prisma `SubscriptionOption`, `RegistrationRequest` (+ migration); public `app/register` + `submitRegistrationRequest`; `lib/register/build-registration-notes.ts`; admin `/admin/registration-requests` (list/detail, approve/reject, duplicate flags); `/admin/subscription-options` CRUD; sidebar **Registrations** / **Plans**; home **Register** link; `prisma/seed.ts` seeds four default plan labels when table empty; approve creates `Customer` with `from-registration` tag only (no Invoiless).


### 2026-04-11 23:19 UTC — pre-push (`main` → origin) @ `0898050`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-11 23:20 UTC — commit `960ea60`

- docs: PROJECT_CONTEXT agent notes for registration feature


### 2026-04-11 23:20 UTC — pre-push (`main` → origin) @ `960ea60`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:32 UTC — commit `c2ff96b`

- feat(admin): copy full /register URL on registration requests page
- **Agent notes** — `components/admin/copy-register-link-button.tsx` copies `origin + /register`; intro on `app/admin/registration-requests/page.tsx`.


### 2026-04-12 00:32 UTC — pre-push (`main` → origin) @ `c2ff96b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:32 UTC — commit `ffeea61`

- docs: PROJECT_CONTEXT for copy register link


### 2026-04-12 00:32 UTC — pre-push (`main` → origin) @ `ffeea61`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:36 UTC — commit `2835216`

- fix(settings): server action body limit for logo upload + blob error message
- **Agent notes** — `next.config.ts` `experimental.serverActions.bodySizeLimit: "3mb"` (default ~1mb multipart was rejecting 2mb-capable uploads); `uploadBrandingLogo` try/catch returns `{ error }` + Blob `contentType`; README Vercel Blob / redeploy note.


### 2026-04-12 00:36 UTC — pre-push (`main` → origin) @ `2835216`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:36 UTC — commit `818ddf3`

- docs: PROJECT_CONTEXT for logo upload fix


### 2026-04-12 00:36 UTC — pre-push (`main` → origin) @ `818ddf3`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:39 UTC — commit `4c8aaea`

- feat(admin): dashboard SIM usage, pending registrations banner, nav


### 2026-04-12 00:40 UTC — pre-push (`main` → origin) @ `4c8aaea`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:45 UTC — commit `b6f8b7a`

- feat(plans): fixed 1/3/6/12 month tiers with editable USD price only


### 2026-04-12 00:45 UTC — pre-push (`main` → origin) @ `b6f8b7a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:47 UTC — commit `e27c6e0`

- style(admin): reorder SIM vs services KPIs and add stat card accents


### 2026-04-12 00:47 UTC — pre-push (`main` → origin) @ `e27c6e0`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:48 UTC — commit `a5aaa81`

- fix(admin): move Plans nav under Settings submenu


### 2026-04-12 00:48 UTC — pre-push (`main` → origin) @ `a5aaa81`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:49 UTC — commit `c89fdf6`

- fix(build): migrate deploy before next build; dynamic /register


### 2026-04-12 00:49 UTC — pre-push (`main` → origin) @ `c89fdf6`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:54 UTC — commit `205bbc1`

- fix(build): Neon migrate via prisma.config directUrl and run-build script


### 2026-04-12 00:54 UTC — pre-push (`main` → origin) @ `205bbc1`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 00:55 UTC — commit `0d64f20`

- chore(build): warn when migrate uses Neon pooler without DIRECT_URL


### 2026-04-12 00:55 UTC — pre-push (`main` → origin) @ `0d64f20`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:01 UTC — commit `c96bfec`

- docs: repair SQL and resolve steps for P3009 subscription migration


### 2026-04-12 01:01 UTC — pre-push (`main` → origin) @ `c96bfec`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:06 UTC — commit `d25a104`

- fix(docs): repair SQL drop NOT NULL on label before insert


### 2026-04-12 01:06 UTC — pre-push (`main` → origin) @ `d25a104`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:09 UTC — commit `6aa70c2`

- feat(plans): store and display subscription prices as XCD (rename priceUsd)


### 2026-04-12 01:09 UTC — pre-push (`main` → origin) @ `6aa70c2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:10 UTC — commit `ece47d8`

- fix(register): pluralize plan term labels (1 month / N months)


### 2026-04-12 01:10 UTC — pre-push (`main` → origin) @ `ece47d8`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:11 UTC — commit `fac9fc2`

- fix(register): remove footer home and admin login links


### 2026-04-12 01:11 UTC — pre-push (`main` → origin) @ `fac9fc2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:14 UTC — commit `f62af93`

- refactor(admin): top header nav; customers and SIMs updates; NCE token and gitignore


### 2026-04-12 01:15 UTC — pre-push (`main` → origin) @ `f62af93`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:15 UTC — commit `613b6bd`

- docs: PROJECT_CONTEXT pre-push hook for f62af93


### 2026-04-12 01:15 UTC — pre-push (`main` → origin) @ `613b6bd`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:15 UTC — commit `ffd3f3f`

- docs: PROJECT_CONTEXT hook for 613b6bd push


### 2026-04-12 01:15 UTC — pre-push (`main` → origin) @ `ffd3f3f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:16 UTC — commit `4c086bf`

- docs: PROJECT_CONTEXT hook for ffd3f3f push


### 2026-04-12 01:16 UTC — pre-push (`main` → origin) @ `4c086bf`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 01:16 UTC — commit `c5aca12`

- docs: PROJECT_CONTEXT pre-push for 4c086bf


### 2026-04-12 01:17 UTC — commit `d1ba631`

- docs: PROJECT_CONTEXT post-commit for c5aca12


### 2026-04-12 01:17 UTC — pre-push (`main` → origin) @ `d1ba631`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 11:26 UTC — commit `a536d48`

- fix(admin): restore sidebar navigation in layout


### 2026-04-12 11:26 UTC — pre-push (`main` → origin) @ `a536d48`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 11:27 UTC — commit `4b68da1`

- docs: PROJECT_CONTEXT for a536d48


### 2026-04-12 11:27 UTC — pre-push (`main` → origin) @ `4b68da1`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 11:34 UTC — commit `7ccec9a`

- fix(1nce): use api.1nce.com for OAuth token endpoint
- `lib/nce/token.ts`: `TOKEN_URL` → `https://api.1nce.com/management-api/oauth/token` (portal host returned 404 HTML on sync); token errors that return HTML show a short hint instead of dumping the page.


### 2026-04-12 11:42 UTC — commit `d6a2833`

- fix(build): harden Prisma migrate on Vercel (P1002)
- `scripts/run-build.mjs`: `migrate deploy` uses `DATABASE_URL` = `DIRECT_URL` when set; retries only on P1002 / advisory-lock messages (removed non-functional lock timeout env var).
- README: deploy notes updated for migrate behavior.


### 2026-04-12 11:43 UTC — commit `928e11b`

- docs: PROJECT_CONTEXT for d6a2833


### 2026-04-12 11:43 UTC — pre-push (`main` → origin) @ `928e11b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 11:47 UTC — commit `b704edc`

- fix(admin): registration approve/reject without redirect in server action
- `registration-review-state.ts`: initial state + `next` URL for client navigation after success; `actions.ts` returns `next` instead of `redirect()`; `RegistrationReviewForms` uses `router.push` when `next` is set.


### 2026-04-12 11:47 UTC — commit `502fbac`

- docs: PROJECT_CONTEXT for b704edc


### 2026-04-12 11:47 UTC — pre-push (`main` → origin) @ `502fbac`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 11:50 UTC — commit `fc9c4d8`

- fix(build): avoid recurring P1002 on Vercel migrate deploy
- `scripts/run-build.mjs`: on `VERCEL=1`, set `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` for migrate unless `TLPORTAL_KEEP_MIGRATE_ADVISORY_LOCK=1` or user already set the Prisma var; optional `SKIP_PRISMA_MIGRATE_ON_BUILD=1`; treat `pgbouncer=true` like pooler in the DIRECT_URL warning.
- README: P1002 causes, mitigations, and env tradeoffs.


### 2026-04-12 11:50 UTC — commit `d2b148a`

- docs: PROJECT_CONTEXT for fc9c4d8


### 2026-04-12 11:50 UTC — pre-push (`main` → origin) @ `d2b148a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 11:55 UTC — commit `3688233`

- fix(1nce): send Basic Authorization header for OAuth token
- `lib/nce/token.ts`: `Authorization: Basic base64(client_id:client_secret)` + JSON `{ grant_type: "client_credentials" }` per 1NCE Dev Hub (fixes 400 Missing Authorization).


### 2026-04-12 11:55 UTC — commit `fdde090`

- docs: PROJECT_CONTEXT for 3688233


### 2026-04-12 11:55 UTC — pre-push (`main` → origin) @ `fdde090`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 12:04 UTC — commit `77f3184`

- feat(admin): first usage day + total MB from 1NCE usage window
- `lib/nce/sim-api.ts`: `summarizeUsageSeries()`; SIM detail usage query widened to ~180 days; UI shows first calendar day with reported usage + sum of daily MB in window (proxy for first data activity).

