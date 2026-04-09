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

