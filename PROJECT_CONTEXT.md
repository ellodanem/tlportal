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


### 2026-04-12 12:04 UTC — commit `c291a7e`

- docs: PROJECT_CONTEXT for 77f3184


### 2026-04-12 12:04 UTC — pre-push (`main` → origin) @ `c291a7e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 12:46 UTC — commit `f5a7e81`

- feat(admin): URL-driven 1NCE SIM usage date range
- `lib/nce/sim-usage-range.ts`: resolve/clamp `usageFrom` / `usageTo` (`YYYY-MM-DD`); `SimUsageRangeControls` presets + custom apply; SIM detail page uses `searchParams` and README note.


### 2026-04-12 12:46 UTC — commit `e565ee3`

- docs: PROJECT_CONTEXT for f5a7e81


### 2026-04-12 12:46 UTC — pre-push (`main` → origin) @ `e565ee3`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 13:02 UTC — commit `04743ab`

- feat(admin): next due visibility on dashboard and customers list
- `lib/admin/dashboard-stats.ts`: attention meta includes next due date; `upcomingBillItems` for active assignments with `nextDueDate`.
- `lib/admin/customer-table-rows.ts` + `/admin/customers`: `CustomersTable` with rollup, services, next due; sort soonest due first.


### 2026-04-12 13:02 UTC — commit `b4a0751`

- docs: PROJECT_CONTEXT for 04743ab


### 2026-04-12 13:02 UTC — pre-push (`main` → origin) @ `b4a0751`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-12 18:50 UTC — commit `65130a0`

- feat(admin): sidebar icons + collapsible nav
- `components/admin-nav-icons.tsx`: sidebar SVG set; `AdminSidebar` collapse toggle + `localStorage`; `AdminCreateMenu` positions flyout to the right when collapsed.


### 2026-04-12 18:51 UTC — commit `efec546`

- docs: PROJECT_CONTEXT for 65130a0


### 2026-04-12 18:51 UTC — pre-push (`main` → origin) @ `efec546`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 17:37 UTC — commit `07fae0e`

- feat(admin): sales proposals with PDF export
- **Agent notes:** Prisma models `Proposal`, `ProposalLineItem`, `ProposalVisualBlock` + migration `20260413180000_proposals`. Admin UI under `/admin/proposals` (list, new draft with defaults, full editor). PDF export `GET /api/admin/proposals/[id]/pdf` (jsPDF + autotable; optional logo + visual images). Env: `PROPOSAL_ISSUER_NAME`, `PROPOSAL_ISSUER_ADDRESS`; asset URLs for PDF use `NEXT_PUBLIC_APP_URL` or `APP_ORIGIN` when resolving relative paths.


### 2026-04-13 17:38 UTC — commit `f35598d`

- docs: PROJECT_CONTEXT agent notes for 07fae0e


### 2026-04-13 17:44 UTC — pre-push (`main` → origin) @ `f35598d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 17:52 UTC — commit `ee782a0`

- feat(proposals): PDF closer to commercial sample layout
- **Agent notes:** Cover mirrors sample flow (Proposal for / subject / commercial line); **Solution pricing** table + total row + italic footnotes; **Application feature set**; **Terms & conditions** with `---` block headings; page “— n of m —”; **Validity** + **Designated contact**. Default draft adds travel + AMC lines and longer terms. Existing DB proposals keep old text until edited.


### 2026-04-13 17:52 UTC — commit `eb11fc3`

- docs: PROJECT_CONTEXT for ee782a0


### 2026-04-13 17:52 UTC — pre-push (`main` → origin) @ `eb11fc3`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 17:59 UTC — commit `b3e9a86`

- feat(proposals): visual blocks — timeline, half-width pairs, alt text
- **Agent notes:** Migration `20260414120000_proposal_visual_kind_layout`. `ProposalVisualBlock`: `kind`, `layout`, `imageAlt`, `timelineSteps` (JSON). PDF pairs consecutive `half_width` media blocks; `timeline` renders a 3+ step strip. Default proposal seeds six visuals (platform, alerts + FleetGuardian pair, trip, install, timeline) with placeholders and alts. Existing proposals: new columns default to media/full; re-save to add timeline/steps in DB.


### 2026-04-13 17:59 UTC — commit `b12af52`

- docs: PROJECT_CONTEXT for b3e9a86


### 2026-04-13 17:59 UTC — pre-push (`main` → origin) @ `b12af52`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 18:02 UTC — commit `c278b5c`

- feat(admin): private Blob branding; trim SIM usage copy; responsive note
- **Agent notes:** Vercel Blob private stores: `put` retries with `access: "private"` when public is rejected; DB uses `private:` prefix on blob URL; `GET /api/branding/logo` streams via `@vercel/blob` `get` for signed-in admins; proposal PDF uses `getBrandingLogoStored` + SDK `get` in `fetchImageAsLogo`. SIM detail page: removed usage help paragraph and `rangeSummary` from `SimUsageRangeControls`. `AGENTS.md` responsive layout note; `.env.example` mentions private Blob stores.


### 2026-04-13 18:03 UTC — commit `00f35dc`

- docs: PROJECT_CONTEXT for c278b5c


### 2026-04-13 18:03 UTC — pre-push (`main` → origin) @ `00f35dc`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 18:16 UTC — commit `473cb0d`

- style(proposals): PDF pricing like sample — emerald theme, 2-col table
- **Agent notes:** Letterhead: centered logo + issuer when logo exists. **Solution pricing** underlined; **Commercial proposal – …** centered above table. Two-column pricing (`Product / service details` | `Price in {currency} (per-unit)`), line detail + qty breakdown in left cell, bold line total right; emerald-50 header / borders / stripes (`lib/proposals/pdf.ts` `THEME`). Amounts `toLocaleString('en-029')` for Caribbean-style grouping.


### 2026-04-13 18:16 UTC — commit `8954d5b`

- docs: PROJECT_CONTEXT for 473cb0d


### 2026-04-13 18:16 UTC — pre-push (`main` → origin) @ `8954d5b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 18:21 UTC — commit `60ddf00`

- fix(proposals): Ellodane Enterprises legal entity vs Track Lucia brand
- **Agent notes:** `getProposalIssuerBlock()` returns `legalName` (default Ellodane Enterprises), `brandLine` (default Track Lucia), `addressLines`. Env: `PROPOSAL_LEGAL_NAME`, `PROPOSAL_BRAND_TAGLINE` (empty or `-` hides brand line), `PROPOSAL_ISSUER_NAME` (alias), `PROPOSAL_ISSUER_ADDRESS`. PDF shows legal + italic brand under logo; validity names legal entity. Default draft terms add “Parties and branding”; limitations/liability name Ellodane. `.env.example` documents vars.


### 2026-04-13 18:21 UTC — commit `1546e1d`

- docs: PROJECT_CONTEXT for 60ddf00


### 2026-04-13 18:21 UTC — pre-push (`main` → origin) @ `1546e1d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 — commit `dcc0b2a`

- feat(proposals): Word (.docx) export alongside PDF
- **Agent notes:** `lib/proposals/docx.ts` mirrors PDF sections (issuer/letterhead, client block, overview, solution pricing table, footnote, feature bullets, visual blocks including half-width pairs and timeline strip, assumptions, next steps, `---`-split terms, validity, designated contact; footer “— n of m —”). `GET /api/admin/proposals/[id]/docx` returns `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Admin editor: **Download Word** next to **Download PDF**. Dependency: `docx` (^9.6.1).


### 2026-04-13 19:00 UTC — commit `935b159`

- docs: PROJECT_CONTEXT for dcc0b2a


### 2026-04-13 19:00 UTC — pre-push (`main` → origin) @ `935b159`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 19:00 UTC — commit `57b7eba`

- docs: dedupe PROJECT_CONTEXT dcc0b2a hook line


### 2026-04-13 19:00 UTC — pre-push (`main` → origin) @ `57b7eba`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 19:01 UTC — commit `f4c7dea`

- docs: PROJECT_CONTEXT for 57b7eba


### 2026-04-13 19:01 UTC — pre-push (`main` → origin) @ `f4c7dea`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 19:01 UTC — commit `ccd9987`

- docs: PROJECT_CONTEXT for f4c7dea


### 2026-04-13 19:01 UTC — commit `a2a3c7d`

- docs: PROJECT_CONTEXT for ccd9987


### 2026-04-13 19:55 UTC — commit `6e885c1`

- fix(proposals): PDF/DOCX match approved template copy and layout
- **Agent notes:** `lib/proposals/proposal-template.ts` holds static template strings (letterhead, headings, footer `-- n of m --`, validity Track Lucia + `{{days}}`, designated-contact labels). PDF/DOCX: repeating two-line letterhead;3-column pricing + QTY + `Price/(currency) Total`; feature block + installation subsection inside table; neutral gray styling (no emerald); footer and validity wording per template. Default draft (`default-draft.ts`) text, terms, line-item descriptions, visuals order (incl. Install block + timeline steps), and pricing footnote line aligned to the approved PDF. **Existing proposals** in DB keep prior field values until edited.


### 2026-04-13 20:09 UTC — commit `a77d3db`

- fix(proposals): cover page layout — header logo, centered title and product mark, footer
- **Agent notes:** Page 1 only: Ellodane (or `PROPOSAL_PDF_HEADER_LOGO`) top-left; centered grey “Proposal for”, bold title, then Track Lucia mark from `PROPOSAL_PDF_CENTER_LOGO` or default fetch `public/proposals/track-lucia-cover.png` (add PNG there); left “Prepared for” + client fields (only variable block on cover). Footer on page 1: centered Ellodane + contact line above `-- n of m --`; inner pages unchanged (top letterhead + page footer). `lib/proposals/proposal-cover-assets.ts`. Word export mirrors the same cover order.


### 2026-04-13 20:15 UTC — commit `37ec8e9`

- feat(proposals): cover sample PDF route and editor link


### 2026-04-13 20:15 UTC — pre-push (`main` → origin) @ `37ec8e9`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:23 UTC — commit `4942377`

- fix(proposals): load public logos from disk; lower cover Prepared-for


### 2026-04-13 20:23 UTC — pre-push (`main` → origin) @ `4942377`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:23 UTC — commit `7fec310`

- docs: PROJECT_CONTEXT for 4942377


### 2026-04-13 20:24 UTC — pre-push (`main` → origin) @ `7fec310`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:24 UTC — commit `b1c3de4`

- docs: PROJECT_CONTEXT for 7fec310


### 2026-04-13 20:24 UTC — pre-push (`main` → origin) @ `b1c3de4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:25 UTC — commit `643b529`

- docs: PROJECT_CONTEXT for b1c3de4


### 2026-04-13 20:25 UTC — pre-push (`main` → origin) @ `643b529`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:25 UTC — commit `18c0a16`

- docs: PROJECT_CONTEXT for 643b529


### 2026-04-13 20:30 UTC — commit `2f390e2`

- fix(proposals): larger cover mark, lower Prepared-for


### 2026-04-13 20:30 UTC — pre-push (`main` → origin) @ `2f390e2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:40 UTC — commit `d363f87`

- fix(proposals): double Track Lucia cover mark size


### 2026-04-13 20:40 UTC — pre-push (`main` → origin) @ `d363f87`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 20:55 UTC — commit `f6bd67f`

- feat(proposals): page-2 inner layout PDF sample


### 2026-04-13 20:55 UTC — pre-push (`main` → origin) @ `f6bd67f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-13 — Proposal PDF visual images: snapshot + reliability plan (agent; uncommitted until you commit)

- **Snapshot of what was “working” before this pass:** Upload wrote files under `public/uploads/proposals/`, the editor saved `/uploads/…` in `ProposalVisualBlock.imageUrl`, auto-save-after-upload ran, PDF/DOCX used `fetchImageAsLogo` (read `public/` from disk first, then HTTP from `resolveAssetFetchOrigin`), and visual bitmaps were keyed by `sortOrder`. Origin resolution used `Host` (and env fallbacks). Despite that, some environments (e.g. dev on non-default ports, `cwd` vs real `public/`, or subtle map/type issues) still produced PDFs with placeholders only.
- **New plan (implemented in this pass):**
  - **Inline embed for typical screenshots:** Local uploads of **PNG/JPEG ≤ ~2.5 MB** now set `imageUrl` to a **`data:image/...;base64,...`** string (file is still written to `public/uploads/proposals/` as a backup). PDF export parses data URLs directly — **no disk path, no HTTP, no port**.
  - **`fetchImageAsLogo`:** Handles `data:image/png` and `data:image/jpeg` first; tries multiple candidate `public/` roots (`TL_PUBLIC_ROOT`, `cwd/public`, `cwd/../public`); keeps blob + http paths as before.
  - **Stable map keys:** PDF/DOCX use `Number(sortOrder)` when populating and reading the visual image map.
  - **Origin fallback:** `resolveAssetFetchOrigin` also uses **`Referer`** when `Host` is missing.
  - **Editor:** If `imageUrl` is inline (`data:image/…`), show a short confirmation + **Remove image** instead of a huge text field.


### 2026-04-14 — Proposal PDF: static “Platform at a glance” image (agent; uncommitted until you commit)

- **Committed asset:** `public/uploads/proposals/static/platform-at-a-glance.png` (dashboard screenshot; replace file to update art).
- **Export behavior:** `lib/proposals/proposal-static-visuals.ts` maps title **Platform at a glance** (case-insensitive) to that path; PDF and DOCX routes use `effectiveVisualImageUrlForExport()` so this **overrides** DB `imageUrl` for that section.


### 2026-04-15 11:14 UTC — commit `dcda859`

- feat: device list copy controls; proposal PDFs and static visuals


### 2026-04-15 11:14 UTC — pre-push (`main` → origin) @ `dcda859`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-15 11:15 UTC — commit `baacfd4`

- docs: project context log (commit + pre-push for dcda859)


### 2026-04-15 11:15 UTC — pre-push (`main` → origin) @ `baacfd4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-15 11:18 UTC — commit `cdf90cc`

- Revert "docs: project context log (baacfd4 push)"


### 2026-04-15 11:18 UTC — pre-push (`main` → origin) @ `cdf90cc`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-15 17:26 UTC — commit `8c0701c`

- feat(admin): Invoiless invoices in TL Portal and device SIM workflows


### 2026-04-15 17:26 UTC — pre-push (`main` → origin) @ `8c0701c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:45 UTC — commit `5482ca3`

- feat(admin): billing terms, device names, Invoiless retainers, renewal doc


### 2026-04-16 16:45 UTC — pre-push (`main` → origin) @ `5482ca3`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:45 UTC — commit `b995f56`

- docs: project context log (pre-push5482ca3)


### 2026-04-16 16:45 UTC — pre-push (`main` → origin) @ `b995f56`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:46 UTC — commit `87a7808`

- docs: project context log (b995f56 commit + pre-push)


### 2026-04-16 16:46 UTC — pre-push (`main` → origin) @ `87a7808`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:46 UTC — commit `24d9823`

- docs: project context log (87a7808)


### 2026-04-16 16:46 UTC — pre-push (`main` → origin) @ `24d9823`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:47 UTC — commit `a59c07f`

- docs: project context log (24d9823 pre-push)


### 2026-04-16 16:47 UTC — pre-push (`main` → origin) @ `a59c07f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:47 UTC — commit `e98d7d9`

- docs: project context log (a59c07f)


### 2026-04-16 16:47 UTC — pre-push (`main` → origin) @ `e98d7d9`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:47 UTC — commit `c0a5028`

- docs: project context log (e98d7d9)


### 2026-04-16 16:47 UTC — pre-push (`main` → origin) @ `c0a5028`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:48 UTC — commit `2f858af`

- docs: project context log (c0a5028)


### 2026-04-16 16:48 UTC — pre-push (`main` → origin) @ `2f858af`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-16 16:48 UTC — commit `6e0eceb`

- docs: project context log (2f858af)


### 2026-04-16 16:48 UTC — pre-push (`main` → origin) @ `6e0eceb`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-17 14:27 UTC — commit `59a8a83`

- feat: prioritize billing visibility and persist login choice


### 2026-04-17 14:27 UTC — commit `8836a3f`

- docs: project context log (59a8a83)


### 2026-04-17 14:27 UTC — pre-push (`main` → origin) @ `8836a3f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-21 21:30 UTC — commit `5a8de5c`

- feat(admin): configurable branding logo size (XL/L/M/S)


### 2026-04-21 21:31 UTC — pre-push (`main` → origin) @ `5a8de5c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-21 21:32 UTC — commit `42f79e6`

- docs: project context log (5a8de5c)


### 2026-04-21 21:32 UTC — pre-push (`main` → origin) @ `42f79e6`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-21 21:35 UTC — commit `77b7b08`

- docs: project context log (42f79e6)


### 2026-04-21 21:35 UTC — pre-push (`main` → origin) @ `77b7b08`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-21 22:28 UTC — commit `d5eccda`

- fix(build): add InactivityTimeout client and auth touch API


### 2026-04-21 22:28 UTC — pre-push (`main` → origin) @ `d5eccda`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-28 14:05 UTC — commit `baa2302`

- fix(admin): show only unallocated SIMs in device swap list


### 2026-04-28 14:05 UTC — pre-push (`main` → origin) @ `baa2302`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-04-28 14:32 UTC — commit `90b30c2`

- feat(admin): add super-admin user management and SIM ICCID copy action


### 2026-04-28 14:33 UTC — pre-push (`main` → origin) @ `90b30c2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 13:15 UTC — commit `aa67d52`

- feat(billing): Phase 1 Stripe subscriptions and TL CustomerSubscription
- Vendor foundation: BillingAccount, BillingInvoice mirror, Stripe Checkout/webhooks, admin billing tab, CustomerSubscription (TL source of truth), fleet health, GPS device links, billing ports/adapters, and architecture docs.
- Prisma migrations: vendor foundation, Stripe billing, stripe monthly rate, billing invoice mirror, customer subscription.


### 2026-05-21 13:15 UTC — pre-push (`main` → origin) @ `aa67d52`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 13:15 UTC — commit `951ea60`

- docs: project context log (aa67d52)


### 2026-05-21 13:15 UTC — pre-push (`main` → origin) @ `951ea60`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 13:16 UTC — commit `fb38534`

- docs: project context log (951ea60)


### 2026-05-21 13:16 UTC — pre-push (`main` → origin) @ `fb38534`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 14:17 UTC — commit `dbaae99`

- feat(billing): Stripe Checkout recovery emails (Phase 2)
- Checkout `after_expiration.recovery`; webhook `checkout.session.expired` emails recovery URL; admin copy for 24h / 30-day links.


### 2026-05-21 14:17 UTC — pre-push (`main` → origin) @ `dbaae99`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 14:18 UTC — commit `2847309`

- docs: project context log (dbaae99)


### 2026-05-21 14:18 UTC — pre-push (`main` → origin) @ `2847309`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 14:18 UTC — commit `9ded965`

- docs: project context log (2847309)


### 2026-05-21 14:18 UTC — pre-push (`main` → origin) @ `9ded965`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:17 UTC — commit `80198b1`

- feat(settings): add SMTP test send in admin settings


### 2026-05-21 15:17 UTC — commit `7048135`

- docs: project context log (80198b1)


### 2026-05-21 15:17 UTC — pre-push (`main` → origin) @ `7048135`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:17 UTC — commit `a8c0c87`

- docs: project context log (7048135)


### 2026-05-21 15:17 UTC — pre-push (`main` → origin) @ `a8c0c87`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:18 UTC — commit `eb51647`

- docs: project context log (a8c0c87)


### 2026-05-21 15:18 UTC — pre-push (`main` → origin) @ `eb51647`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:31 UTC — commit `3dd3334`

- feat(billing): Phase 3 catalog pricing per vehicle and tier
- SubscriptionCatalogPrice matrix (30/25/20 XCD tiers × 1/3/6/12 mo); Checkout catalog Price × vehicle quantity; dynamic fallback for custom rates; admin catalog editor on subscription options.


### 2026-05-21 15:31 UTC — pre-push (`main` → origin) @ `3dd3334`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:32 UTC — commit `350ba55`

- docs: project context log (3dd3334)


### 2026-05-21 15:32 UTC — pre-push (`main` → origin) @ `350ba55`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:58 UTC — commit `42b8331`

- docs: project context log (350ba55)


### 2026-05-21 15:58 UTC — pre-push (`main` → origin) @ `42b8331`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 15:58 UTC — commit `dfa04ae`

- docs: project context log (42b8331)


### 2026-05-21 15:58 UTC — pre-push (`main` → origin) @ `dfa04ae`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 16:10 UTC — commit `5154b4c`

- feat(billing): Phase 4 lifecycle setup without auto-checkout


### 2026-05-21 16:10 UTC — pre-push (`main` → origin) @ `5154b4c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 16:10 UTC — commit `4ce3caf`

- docs: project context log (5154b4c)


### 2026-05-21 16:10 UTC — pre-push (`main` → origin) @ `4ce3caf`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 16:42 UTC — commit `1079644`

- feat(billing): Phase 5 mirror Stripe paid invoices to Invoiless


### 2026-05-21 16:42 UTC — commit `704929e`

- feat(ops): Phase 6 renewal mark paid and Stripe auto-advance


### 2026-05-21 16:42 UTC — pre-push (`main` → origin) @ `704929e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 16:42 UTC — commit `8560074`

- docs: project context log (704929e)


### 2026-05-21 16:42 UTC — pre-push (`main` → origin) @ `8560074`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 16:44 UTC — commit `9ea20c4`

- feat(billing): Phase 7 Invoiless accounting hardening


### 2026-05-21 16:45 UTC — pre-push (`main` → origin) @ `9ea20c4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 16:45 UTC — commit `d35f86e`

- docs: project context log (9ea20c4)


### 2026-05-21 16:45 UTC — pre-push (`main` → origin) @ `d35f86e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 17:03 UTC — commit `61c578c`

- docs(billing): agent handoff for phases 1-7


### 2026-05-21 17:03 UTC — pre-push (`main` → origin) @ `61c578c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-21 17:03 UTC — commit `8e65156`

- docs: project context log (61c578c)


### 2026-05-21 17:03 UTC — pre-push (`main` → origin) @ `8e65156`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 08:59 UTC — commit `e080228`

- feat(billing): TL paid invoice PDFs with TL-INV numbering


### 2026-05-22 09:00 UTC — commit `434129e`

- feat(billing): TL paid invoice PDFs with TL-INV numbering


### 2026-05-22 09:00 UTC — commit `7067c64`

- feat(billing): TL paid invoice PDFs with TL-INV numbering


### 2026-05-22 09:00 UTC — pre-push (`main` → origin) @ `7067c64`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:01 UTC — commit `453f5c1`

- docs: project context log (7067c64)


### 2026-05-22 09:01 UTC — pre-push (`main` → origin) @ `453f5c1`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:04 UTC — commit `105130a`

- fix(billing): move Invoiless preview URL out of server-only module


### 2026-05-22 09:04 UTC — pre-push (`main` → origin) @ `105130a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:31 UTC — commit `e3b6f67`

- feat(broadcast): template library with test email (phase 1a)


### 2026-05-22 09:32 UTC — commit `a739e7c`

- refactor(admin): billing page IA slice 1


### 2026-05-22 09:32 UTC — pre-push (`main` → origin) @ `a739e7c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:32 UTC — pre-push (`main` → origin) @ `a739e7c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:32 UTC — commit `3b85623`

- docs: project context log (a739e7c)


### 2026-05-22 09:32 UTC — pre-push (`main` → origin) @ `3b85623`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:41 UTC — commit `63442a6`

- feat(broadcast): mass email campaigns with batched send (phase 1b)


### 2026-05-22 09:41 UTC — pre-push (`main` → origin) @ `63442a6`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:45 UTC — commit `5cd8620`

- fix(devices): avoid redirect in useActionState device forms


### 2026-05-22 09:45 UTC — pre-push (`main` → origin) @ `5cd8620`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:46 UTC — commit `d4ebba2`

- docs: project context log (5cd8620)


### 2026-05-22 09:46 UTC — pre-push (`main` → origin) @ `d4ebba2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:46 UTC — commit `2a04fa2`

- docs: project context log (d4ebba2)


### 2026-05-22 09:46 UTC — pre-push (`main` → origin) @ `2a04fa2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:47 UTC — commit `455f6a8`

- chore: sync PROJECT_CONTEXT log


### 2026-05-22 09:47 UTC — pre-push (`main` → origin) @ `455f6a8`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:47 UTC — commit `ad1f47a`

- chore: sync PROJECT_CONTEXT after push log


### 2026-05-22 09:47 UTC — pre-push (`main` → origin) @ `ad1f47a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:48 UTC — commit `355af9b`

- chore: project context log (ad1f47a)


### 2026-05-22 09:48 UTC — pre-push (`main` → origin) @ `355af9b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:53 UTC — commit `f18238c`

- refactor(admin): billing checkout hero slice 2


### 2026-05-22 09:53 UTC — pre-push (`main` → origin) @ `f18238c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:53 UTC — commit `406a65e`

- docs: project context log (f18238c)


### 2026-05-22 09:53 UTC — pre-push (`main` → origin) @ `406a65e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:57 UTC — commit `20954be`

- fix(devices): refresh in place when saving billing term


### 2026-05-22 09:57 UTC — pre-push (`main` → origin) @ `20954be`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 09:57 UTC — commit `5df9459`

- docs: project context log (20954be)


### 2026-05-22 09:57 UTC — pre-push (`main` → origin) @ `5df9459`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:15 UTC — commit `f1af6c5`

- Refine paid invoice PDF layout to match Invoiceless style.


### 2026-05-22 10:15 UTC — pre-push (`main` → origin) @ `f1af6c5`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:15 UTC — commit `a9a7020`

- docs: project context log (f1af6c5)


### 2026-05-22 10:15 UTC — pre-push (`main` → origin) @ `a9a7020`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:16 UTC — commit `74279d4`

- docs: project context log (a9a7020)


### 2026-05-22 10:16 UTC — pre-push (`main` → origin) @ `74279d4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:16 UTC — commit `3c977af`

- docs: project context log (74279d4)


### 2026-05-22 10:16 UTC — pre-push (`main` → origin) @ `3c977af`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:17 UTC — commit `ce90787`

- docs: project context log (3c977af)


### 2026-05-22 10:17 UTC — pre-push (`main` → origin) @ `ce90787`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:23 UTC — commit `e416ab3`

- fix(admin): move checkout helper text above payment form


### 2026-05-22 10:23 UTC — pre-push (`main` → origin) @ `e416ab3`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:24 UTC — commit `15fd1c0`

- docs: project context log (e416ab3)


### 2026-05-22 10:24 UTC — pre-push (`main` → origin) @ `15fd1c0`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:39 UTC — commit `98f7d60`

- chore: trigger Vercel production redeploy


### 2026-05-22 10:39 UTC — pre-push (`main` → origin) @ `98f7d60`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:39 UTC — commit `c3a34f4`

- docs: project context log (98f7d60)


### 2026-05-22 10:39 UTC — pre-push (`main` → origin) @ `c3a34f4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:44 UTC — commit `e648390`

- fix(vercel): daily broadcast cron for Hobby plan limit


### 2026-05-22 10:45 UTC — pre-push (`main` → origin) @ `e648390`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:45 UTC — commit `8894fb5`

- docs: env example for broadcast cron batch; context log (e648390)


### 2026-05-22 10:45 UTC — pre-push (`main` → origin) @ `8894fb5`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:53 UTC — commit `83a5b9e`

- docs: Vercel Hobby cron deploy blocker for agents


### 2026-05-22 10:53 UTC — pre-push (`main` → origin) @ `83a5b9e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:54 UTC — commit `a8695ae`

- docs: project context log (83a5b9e)


### 2026-05-22 10:54 UTC — pre-push (`main` → origin) @ `a8695ae`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 10:57 UTC — commit `b117d15`

- fix(billing): serialize invoice Decimal for client list


### 2026-05-22 10:57 UTC — pre-push (`main` → origin) @ `b117d15`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 11:39 UTC — commit `c58d16b`

- refactor(admin): tighten customer overview dashboard


### 2026-05-22 11:40 UTC — pre-push (`main` → origin) @ `c58d16b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 11:40 UTC — commit `cc2c0d6`

- docs: project context log (c58d16b)


### 2026-05-22 11:40 UTC — pre-push (`main` → origin) @ `cc2c0d6`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 11:44 UTC — commit `554250a`

- fix(billing): avoid checkout action 500 from early revalidate


### 2026-05-22 11:44 UTC — pre-push (`main` → origin) @ `554250a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 11:44 UTC — commit `8192be9`

- docs: project context log (554250a)


### 2026-05-22 11:44 UTC — pre-push (`main` → origin) @ `8192be9`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 22:55 UTC — commit `884b4f5`

- fix(billing): move renewal action initial state out of use server


### 2026-05-22 22:55 UTC — pre-push (`main` → origin) @ `884b4f5`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 23:09 UTC — commit `9055ccf`

- docs(billing): lock one-off charges to Admin Invoices module


### 2026-05-22 23:09 UTC — commit `fac7392`

- docs(billing): lock one-off charges to Admin Invoices module


### 2026-05-22 23:10 UTC — pre-push (`main` → origin) @ `fac7392`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-22 23:10 UTC — commit `2ec54a9`

- docs: project context log (fac7392)


### 2026-05-22 23:10 UTC — pre-push (`main` → origin) @ `2ec54a9`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 02:26 UTC — commit `e501442`

- feat(admin): customers device expand, invoice date, drop subscriptions hub


### 2026-05-23 02:26 UTC — pre-push (`main` → origin) @ `e501442`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 02:27 UTC — commit `be23868`

- fix(admin): invoice date field and standard-only create form UI


### 2026-05-23 02:27 UTC — pre-push (`main` → origin) @ `be23868`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 02:27 UTC — commit `1721dad`

- docs: project context log (be23868)


### 2026-05-23 02:27 UTC — pre-push (`main` → origin) @ `1721dad`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 11:27 UTC — commit `3558d4d`

- fix(admin): fleet health accepts 1NCE Enabled/Activated SIMs


### 2026-05-23 11:27 UTC — commit `cf369a9`

- docs: project context log (3558d4d)


### 2026-05-23 11:28 UTC — pre-push (`main` → origin) @ `cf369a9`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 11:28 UTC — commit `7cfb060`

- docs: project context log (cf369a9)


### 2026-05-23 11:28 UTC — pre-push (`main` → origin) @ `7cfb060`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 11:28 UTC — commit `fa34f7d`

- docs: project context log (7cfb060)


### 2026-05-23 11:29 UTC — pre-push (`main` → origin) @ `fa34f7d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 11:44 UTC — commit `c58a2fd`

- feat(admin): Traqcare copy buttons and billing ribbon spacing


### 2026-05-23 11:45 UTC — pre-push (`main` → origin) @ `c58a2fd`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-23 11:45 UTC — commit `2ce26ad`

- docs: project context log (c58a2fd)


### 2026-05-23 11:45 UTC — pre-push (`main` → origin) @ `2ce26ad`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-24 13:17 UTC — commit `3067766`

- feat(register): optional additional users field


### 2026-05-24 13:17 UTC — pre-push (`main` → origin) @ `3067766`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-24 13:18 UTC — commit `d8fef53`

- docs: project context log (3067766)


### 2026-05-24 13:18 UTC — pre-push (`main` → origin) @ `d8fef53`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-24 13:18 UTC — commit `ce60f5b`

- docs: project context log (d8fef53)


### 2026-05-24 13:18 UTC — pre-push (`main` → origin) @ `ce60f5b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-24 13:18 UTC — commit `da4df03`

- docs: project context log (ce60f5b)


### 2026-05-24 13:18 UTC — pre-push (`main` → origin) @ `da4df03`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-24 14:18 UTC — commit `9a78e8d`

- fix(register): place additional users below vehicle details


### 2026-05-24 14:18 UTC — pre-push (`main` → origin) @ `9a78e8d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-24 14:18 UTC — commit `b729d4a`

- docs: project context log (9a78e8d)


### 2026-05-24 14:18 UTC — pre-push (`main` → origin) @ `b729d4a`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-29 10:56 UTC — commit `c5f058f`

- feat(billing): WhatsApp renewal reminders and staff pay-link alerts


### 2026-05-29 10:56 UTC — pre-push (`main` → origin) @ `c5f058f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-29 10:56 UTC — commit `f796066`

- docs: project context log (c5f058f)


### 2026-05-29 10:56 UTC — pre-push (`main` → origin) @ `f796066`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-29 11:39 UTC — commit `ff3fcb2`

- feat(billing): WhatsApp on Stripe payment link and new invoices


### 2026-05-29 11:39 UTC — pre-push (`main` → origin) @ `ff3fcb2`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-29 11:39 UTC — commit `8b4471f`

- docs: project context log (ff3fcb2)


### 2026-05-29 11:39 UTC — pre-push (`main` → origin) @ `8b4471f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-29 11:46 UTC — commit `1d2a097`

- feat(billing): preview email and WhatsApp before sending payment link


### 2026-05-29 11:46 UTC — pre-push (`main` → origin) @ `1d2a097`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-29 11:46 UTC — commit `d6cb459`

- docs: project context log (1d2a097)


### 2026-05-29 11:47 UTC — pre-push (`main` → origin) @ `d6cb459`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-05-30 19:32 UTC — commit `c47bb2c`

- feat(billing): auto-email paid receipts and enlarge invoice logo


### 2026-05-30 19:33 UTC — commit `22a1601`

- docs: project context log (c47bb2c)


### 2026-05-30 19:34 UTC — pre-push (`main` → origin) @ `22a1601`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-05 09:51 UTC — commit `362232e`

- Reorder Manage device sections for a clearer setup flow.


### 2026-06-05 09:51 UTC — pre-push (`main` → origin) @ `362232e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-10 08:37 UTC — commit `62b4647`

- Move Needs attention beside Devices needing review on admin dashboard.


### 2026-06-10 08:37 UTC — pre-push (`main` → origin) @ `62b4647`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-10 08:38 UTC — commit `6c4d6c4`

- feat(billing): optional next-due date on manual mark paid


### 2026-06-10 08:38 UTC — pre-push (`main` → origin) @ `6c4d6c4`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-10 08:38 UTC — commit `0b2ee8d`

- docs: project context log (6c4d6c4)


### 2026-06-10 08:38 UTC — pre-push (`main` → origin) @ `0b2ee8d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-10 08:39 UTC — commit `b4f5569`

- docs: project context log (0b2ee8d)


### 2026-06-10 08:39 UTC — pre-push (`main` → origin) @ `b4f5569`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-18 13:28 UTC — commit `c4680f1`

- feat(customers): add archive for churned accounts


### 2026-06-18 13:29 UTC — commit `768fb5f`

- docs: project context log (c4680f1)


### 2026-06-18 13:29 UTC — pre-push (`main` → origin) @ `768fb5f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-25 10:52 UTC — commit `a400e8f`

- feat(billing): edit next due inline and in bulk on renewal ops


### 2026-06-25 10:52 UTC — pre-push (`main` → origin) @ `a400e8f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-25 11:02 UTC — commit `2cdfa7e`

- feat(billing): edit billing term inline and in bulk on renewal ops


### 2026-06-25 11:02 UTC — pre-push (`main` → origin) @ `2cdfa7e`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-29 16:24 UTC — commit `2a8b69b`

- feat(admin): add Quick quote PDF generator when Invoiless is unavailable


### 2026-06-29 16:25 UTC — pre-push (`main` → origin) @ `2a8b69b`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-29 16:37 UTC — commit `087316c`

- feat(admin): email quick quotes with preview and fix PDF generation hang


### 2026-06-29 16:37 UTC — pre-push (`main` → origin) @ `087316c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-29 16:38 UTC — pre-push (`main` → origin) @ `087316c`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-29 16:49 UTC — commit `7247c5d`

- feat(admin): add Cc and Bcc to quote email with default Bcc for Dane


### 2026-06-29 16:49 UTC — pre-push (`main` → origin) @ `7247c5d`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-29 22:36 UTC — commit `9e6b209`

- feat(billing): native billing Phase 0 schema and services


### 2026-06-29 22:42 UTC — commit `a6029be`

- feat(billing): native billing Phase 1 persisted quotes


### 2026-06-29 22:42 UTC — commit `0c20215`

- fix(billing): add persisted quote PDF download route


### 2026-06-30 09:03 UTC — pre-push (`main` → origin) @ `0c20215`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).


### 2026-06-30 09:10 UTC — commit `d93a32f`

- feat(billing): native billing Phase 2 TL invoices


### 2026-06-30 09:10 UTC — pre-push (`main` → origin) @ `d93a32f`

- Hook runs before upload; if the push fails, this entry still exists (edit or add a follow-up note).

