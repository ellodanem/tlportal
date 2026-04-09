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

