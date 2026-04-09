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

