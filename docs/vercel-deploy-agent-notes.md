# Vercel deploy — agent notes

Reference for agents debugging **“commits on GitHub but Production unchanged”** or **missing Vercel deployments**.

---

## Root cause (2026-05-22, confirmed)

**Invalid cron schedule in `vercel.json` on a Vercel Hobby account.**

| Item | Detail |
|------|--------|
| **Bad config** | `"schedule": "*/2 * * * *"` on `/api/cron/broadcast-send` (every 2 minutes) |
| **Plan rule** | **Hobby** only allows cron jobs that run **at most once per day** |
| **Vercel error** | *“Hobby accounts are limited to daily cron jobs. This cron expression (*/2 * * * *) would run more than once per day. Upgrade to the Pro plan…”* |
| **Effect** | New **production deployments stopped** — not a git/push problem. `origin/main` advanced; **`vercel[bot]` created no GitHub Deployments** after `3b85623`. Empty commits did not help. |
| **User-visible symptom** | Production UI lagged local by many commits (e.g. billing slice 2 missing: still “Save monthly rate”, long plan-term labels). Suspected “404 on plan term” was stale build / server-action mismatch, not a missing route. |
| **Fix** | `e648390` — broadcast cron → **`10 4 * * *`** (daily 04:10 UTC, after nightly SIM sync at 04:05). README documents Hobby vs Pro. |

**Do not** reintroduce sub-daily cron schedules on Hobby without upgrading the Vercel plan or removing the cron entry from `vercel.json`.

---

## Current `vercel.json` crons (Hobby-safe)

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/nightly-sims-sync` | `5 4 * * *` | 1NCE SIM import (~00:05 AST) |
| `/api/cron/broadcast-send` | `10 4 * * *` | Broadcast email batch (daily; `BROADCAST_CRON_BATCH_SIZE`, default 50) |

**Pro only:** more frequent `broadcast-send` (e.g. `*/2 * * * *`) for near-real-time mass email.

---

## How to diagnose (next time)

1. **GitHub `main` SHA** vs **Vercel Production deployment SHA** — if GitHub is ahead for hours, deploy pipeline is broken.
2. **GitHub → repo → Deployments** (or API `repos/.../deployments`) — last **`vercel[bot]`** deployment SHA and time.
3. **Vercel → Deployments** — failed builds; open logs for **cron / vercel.json** validation errors.
4. **Do not assume** push failed — verify `git log origin/main` matches local.
5. **Manual recovery:** Vercel **Create Deployment** / **Redeploy** from latest `main`, or **Deploy Hook** if webhooks are dead.

---

## Payment link → “This page couldn’t load” (2026-05-22)

| Cause | Detail |
|-------|--------|
| **RSC revalidate mid-action** | `startStripeCheckoutAction` called `revalidatePath` **before** Checkout finished. If the billing page re-render threw (e.g. Prisma `Decimal` on `StripeInvoicesList`), the whole server action failed with a generic Vercel 500. |
| **Decimal** | Fixed in `b117d15` — serialize `BillingInvoice.amountXcd` in `load-customer-billing.ts`. |
| **Missing email** | Stripe customer creation requires email — now validated before Checkout (`assertCustomerReadyForStripeCheckout`). |
| **Fix** | `revalidate` only **after** successful link create/email; wrap checkout actions in `try/catch` so errors show inline on the form. |

---

## Related docs

- `README.md` — Neon migrate, `CRON_SECRET`, broadcast cron Hobby note
- `docs/billing-agent-handoff.md` — billing UI slices (local vs Production mismatch was deploy lag, not missing commits)
- `PROJECT_CONTEXT.md` — commit `e648390`, `8894fb5`
