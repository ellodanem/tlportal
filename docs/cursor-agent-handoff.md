# TL Portal — Cursor agent handoff

Prepared 2026-10-28 for starting or continuing Cursor chats in this repository. This is a compact replacement for chat context; it does not reproduce conversations that Cursor no longer has access to.

## Paste this into a new Cursor chat

```text
You are continuing work in the TL Portal repository. First read, in full:
1. AGENTS.md
2. docs/cursor-agent-handoff.md
3. PROJECT_CONTEXT.md (read the most recent entries)

Treat the current working tree as user work: inspect `git status` and `git diff` before editing, preserve unrelated changes, and do not reset, checkout, stash, or discard anything. For any Next.js code change, read the relevant guide under node_modules/next/dist/docs/ first. Continue from the uncommitted billing/Stripe reconciliation work described in the handoff; verify it before committing. Do not perform live billing, Stripe, Vercel, database, migration, or production configuration operations unless the owner explicitly asks.
```

## Repository snapshot

- Repository: `https://github.com/ellodanem/tlportal.git`
- Branch: `main`
- Current committed HEAD: `4982f32cc165b7d42a0c33b32902f7c88775b1e5` — `data: consolidate Kerry expenses under Kerry A` (2026-10-22)
- Stack: Next.js 16.2.3 App Router, React 19, TypeScript, Tailwind 4, Prisma 6/PostgreSQL.
- Primary product: Track Lucia's internal admin portal for customers, trackers/SIMs, subscriptions, native invoices/expenses, Stripe, and Invoiless.
- Durable git history: `PROJECT_CONTEXT.md` is append-only. Its recent entries record commits through `4982f32`.

Run `npm run hooks:install` once per clone. The Git hooks append commit/push summaries to `PROJECT_CONTEXT.md`. After any commit or push, ensure that log has the required new entry; do not rewrite its earlier entries.

## Non-negotiable operating rules

- Read `AGENTS.md` before coding. This project uses a newer Next.js version with breaking changes; consult the relevant local Next.js guide before code changes.
- Preserve worktree changes not made in the current task. Never use a destructive git command unless the owner explicitly asks.
- Keep new UI usable on narrow screens. Avoid desktop-only fixed sidebars/tables and retain workable tap targets.
- `vercel.json` is constrained by Vercel Hobby: every cron must be at most daily. A sub-daily cron can stop all Vercel deployments. Read `docs/vercel-deploy-agent-notes.md` before touching crons.
- Production billing is safety-sensitive. Do not set canonical execution/pilot/live-canary variables or make real Stripe, Vercel, Neon, or data-changing production calls without explicit owner authorization.
- Never copy secrets from `.env.local`, deployment settings, or account dashboards into chat, commits, or docs.

## Current uncommitted work — inspect before changing

At handoff time, these tracked files are modified and **not committed**. They appear to be one cohesive billing UX and Stripe-state correction, but have not been fully validated during this handoff.

| Area | Intended change |
| --- | --- |
| Customer/subscription navigation | Direct subscription-related actions to `/admin/subscriptions/{customerId}/renewals` rather than the customer billing page. |
| Recurring schedules | Hide `ended` schedules by default on `/admin/recurring-invoices`; offer a `?showEnded=1` toggle. |
| Native invoices | Delete only draft invoices (with confirmation); allow voiding finalized/collectible and paid invoices rather than drafts. |
| Canonical Stripe adoption | Treat Stripe `past_due` and `unpaid` as a matching ongoing provider relationship, while preserving TL collection health as `past_due`. |
| Tests | Add source/navigation coverage for ended schedules and domain coverage for `past_due` / `unpaid` Stripe reconciliation. |
| Context log | Append history for the latest commits; this is the expected append-only change to `PROJECT_CONTEXT.md`. |

Files currently modified:

```text
PROJECT_CONTEXT.md
app/admin/customers/[id]/billing/page.tsx
app/admin/recurring-invoices/page.tsx
app/admin/tl-invoices/[id]/page.tsx
app/admin/tl-invoices/actions.ts
components/admin/customer-services-expand.tsx
components/admin/invoice-payment-form.tsx
lib/domain/canonical-stripe-shadow.ts
lib/services/canonical-stripe-adoption-service.ts
lib/services/native-invoice-service.ts
tests/billing-recurring-navigation.test.ts
tests/canonical-stripe-shadow.test.ts
```

Suggested first checks:

```powershell
git status --short
git diff --check
git diff -- <a file above>
npm test -- --test-name-pattern "billing|canonical"
npm run lint
```

Run broader validation only when appropriate for the task. Do not commit merely because the diff is present: first check behavior, authorization, and test results. The invoice-delete action is intentionally destructive at the application level, so it must remain restricted to native `draft` invoices and must never apply to Stripe mirrors or historical invoices.

## Product and billing mental model

The portal is the operational control layer; provider systems are not interchangeable sources of truth.

| Concern | Authority / expected path |
| --- | --- |
| Customer, device/service assignment, canonical subscription, renewal state | TL Portal / PostgreSQL |
| Card subscription billing | Stripe; use the customer billing/subscription flows and signed webhooks |
| One-off hardware, cash, manual lines | Native TL invoices / Invoiless accounting path; do not make Stripe Checkout the default |
| Manual recurring collection | Native recurring invoice schedules; distinct from Stripe-managed subscriptions |
| Service renewal timing | Per `ServiceAssignment`, not merely per customer; terms are 1, 3, 6, or 12 months |

Important rules:

- One customer can have services with different terms. Stripe's quantity uses only the assignments matching the customer's Stripe plan term; other-term services are renewed manually.
- A successful Stripe payment may advance matching assignment due dates through the established webhook path. Do not double-advance or introduce broad invoice-to-assignment links without a specific scoped request.
- `past_due` is a collection condition, not automatic permission to disable tracking services or rewrite commercial terms.
- Preserve invoice, payment, provider-link, and accounting history. Draft native invoices are the narrow exception that may be deleted.
- Legacy recurring schedules, canonical subscriptions, native invoices, Stripe mirror invoices, and Invoiless records are different objects. Confirm the object type before altering a workflow.

## Canonical billing safety status

Canonical provider execution is deliberately disabled in Production unless separately and explicitly approved. Existing production UI can be read-only; visibility is not execution authority.

Do not enable or populate the canonical execution, migration, manual-pilot, or live-canary configuration listed in these documents unless the owner provides a scoped, current authorization:

- `docs/canonical-stripe-live-canary-deployment-readiness.md`
- `docs/canonical-stripe-live-canary-runbook.md`
- `docs/canonical-manual-pilot-runbook.md`

The live-canary path is limited to one allowlisted customer/subscription, requires exact signed authorization and an owner-reviewed operation, and is not a general Stripe migration mechanism. The manual pilot has analogous allowlisting and signed-authorization requirements. No chat instruction alone should be interpreted as authorization to bill or migrate a real customer.

## High-value reference map

| Need | Start here |
| --- | --- |
| Project rules and responsive/UI constraints | `AGENTS.md` |
| What was committed and pushed | `PROJECT_CONTEXT.md` (latest entries) |
| Legacy billing architecture/history | `docs/billing-agent-handoff.md` |
| Renewal model and what remains deferred | `docs/subscription-renewal-tracking.md` |
| Canonical architecture | `docs/vendor-agnostic-architecture.md`, `docs/phase-1-vendor-foundation-plan.md` |
| Manual pilot safety | `docs/canonical-manual-pilot-runbook.md` |
| Live Stripe canary safety | `docs/canonical-stripe-live-canary-runbook.md`, `docs/canonical-stripe-live-canary-deployment-readiness.md` |
| Vercel deployment/cron troubleshooting | `docs/vercel-deploy-agent-notes.md` |
| Existing billing source map | `docs/billing-agent-handoff.md` and `docs/subscription-renewal-tracking.md` |
| Schema | `prisma/schema.prisma` |
| Native invoice behavior | `lib/services/native-invoice-service.ts`, `app/admin/tl-invoices/actions.ts` |
| Canonical Stripe reconciliation/adoption | `lib/domain/canonical-stripe-shadow.ts`, `lib/services/canonical-stripe-adoption-service.ts` |

## Useful commands

```powershell
npm run dev
npm test
npm run lint
npm run build
npm run db:generate
npm run hooks:install
git status --short
git diff --check
```

`npm run build` may run Prisma migration deployment in a production-like context; read the README's deployment section before using it against any non-local environment. Use `npm run test:postgres-foundation` only with an intentionally configured disposable/local PostgreSQL environment.

## Good handoff hygiene for the next agent

At the end of a task, report:

1. the exact request completed;
2. changed files and why;
3. validation run and its result;
4. any deliberate non-action or safety boundary;
5. commit SHA and push/deployment state, if applicable; and
6. any remaining work or decision that requires the owner's input.

If the new agent needs more detail than this document supplies, it should use the repository's source, tests, `git log`, `git show`, and the durable project context—not invent missing chat history.
