# TL Portal billing — agent handoff (Phases 1–7)

Handoff for agents continuing billing work. **Branch:** `main` (through `d35f86e`, 2026-05-21). **Transcript:** `agent-transcripts/6413d68c-8219-4b0c-ac67-119b402d4c56.jsonl`.

**Production lag vs local (2026-05-22):** If billing UI on Vercel looks older than local, check Vercel Production SHA first — an invalid **Hobby cron** in `vercel.json` stopped deploys after `3b85623` until `e648390`. See **`docs/vercel-deploy-agent-notes.md`**.

---

## North star

| Layer | Role |
|-------|------|
| **TL Portal** | `CustomerSubscription`, `ServiceAssignment`, billing mode, renewal dates |
| **Stripe** | Card Checkout, subscriptions, webhooks, `BillingInvoice` mirror |
| **Invoiless** | Accounting mirror (manual invoices + Paid copy of Stripe payments) |

- Card **subscription** billing: **Customer → Billing** (not Admin → Invoices).
- **One-off** billing (hardware, cash, manual lines): **Admin → Invoices → New** → Invoiless. Keep this as the product default; do not steer one-offs to Stripe Checkout unless explicitly requested later.
- **Do not** auto-start Checkout on create; staff use **Create payment link**.
- Catalog: Stripe Price × **vehicle quantity**; tiers $30/$25/$20 × terms 1/3/6/12 mo.

---

## Phases shipped

| Phase | Commit (approx) | Summary |
|-------|-----------------|---------|
| **1** | `aa67d52` | `CustomerSubscription`, Stripe webhooks, Billing tab, `BillingAccount` / `BillingInvoice` |
| **2** | (see `PROJECT_CONTEXT`) | Checkout recovery email on `checkout.session.expired` |
| **3** | `3dd3334` | `SubscriptionCatalogPrice`, catalog Checkout, admin Stripe catalog table |
| **4** | `5154b4c` | `enableCustomerBillingLifecycle`, link accounts without Checkout |
| **5** | `1079644` | `invoice.paid` → Invoiless Paid mirror (`invoilessMirrorInvoiceId`) |
| **6** | `704929e` | Mark period paid, Stripe auto-advance `nextDueDate` |
| **7** | `9ea20c4` | Invoiless via `BillingAccount`, accounting copy on Invoices admin |

### Phase 4 UX (`5154b4c`, polish `704929e`, fix after `704929e`)

- Create customer with **Run billing setup** checked → `/billing?setup=1` (+ `?warn=` for lifecycle messages)
- Create without setup → `/billing` only (no false “setup ran” banner)
- Setup banner explains stripe vs manual; **no subscription/Checkout yet**
- Billing panel: provider links + **Link billing accounts** + setup action messages

---

## Key files

**Stripe:** `app/api/webhooks/stripe/route.ts`, `lib/stripe/webhook-handlers.ts`, `lib/stripe/checkout.ts`, `lib/stripe/checkout-pricing.ts`, `lib/stripe/catalog-price-ids.ts`, `lib/stripe/subscription-sync.ts`, `lib/stripe/invoice-sync.ts`

**Services:** `lib/services/billing-service.ts`, `billing-lifecycle-service.ts`, `customer-subscription-service.ts`, `invoiless-stripe-mirror-service.ts`, `assignment-renewal-service.ts`

**Admin UI:** `app/admin/customers/[id]/billing/page.tsx`, `billing-actions.ts`, `renewal-actions.ts`, `components/admin/customer-billing-panel.tsx`, `customer-renewal-ops-panel.tsx`

**Invoiless accounting:** `app/admin/invoices/*`, `lib/admin/invoiless-customer-links.ts`, `lib/invoiless/invoice-mutate.ts`

**Loaders:** `lib/admin/load-customer-billing.ts`

---

## Two invoice surfaces

| UI | Source |
|----|--------|
| Customer → Billing → Stripe invoices | `BillingInvoice` (DB, webhooks) |
| Admin → Invoices | Invoiless API (live list) |

---

## Prisma (billing)

- `Customer`: `billingMode`, `stripeMonthlyRateXcd`, `invoilessCustomerId` (legacy; sync keeps aligned)
- `BillingAccount`: per provider (`stripe` / `invoiless`)
- `CustomerSubscription`: TL subscription; `pending_payment` until Checkout paid
- `BillingInvoice`: Stripe mirror; `invoilessMirrorInvoiceId` after Phase 5
- `SubscriptionCatalogPrice`: tier × term → `stripePriceId`
- `ServiceAssignment`: `intervalMonths`, `nextDueDate`, `lastInvoiceId`, `lastPaymentStatus`

---

## Env

```
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_BILLING_ENABLED
STRIPE_PRICE_{20|25|30}_{1|3|6|12}MO  # or DB catalog in admin
INVOILESS_API_KEY
INVOILESS_STRIPE_MIRROR=          # default on; 0 disables Phase 5
STRIPE_RENEWAL_AUTO_ADVANCE=      # default on; 0 disables Phase 6 webhook advance
```

Webhook events: `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.*`, `invoice.paid`, `invoice.finalized`, …

---

## `invoice.paid` order

1. Sync Stripe invoice + subscription to DB  
2. Operational event  
3. Phase 5: mirror to Invoiless (non-fatal)  
4. Phase 6: advance active assignments (non-fatal)  

---

## Phase 8 — TL paid invoice PDF (if on `main` after 2026-05-23)

- `TL-INV-{n}` via `InvoiceSequence`; `displayNumber` + `providerInvoiceNumber` on `BillingInvoice`
- Generate on `invoice.paid` → Vercel Blob (`pdfStoragePath`); Billing tab **Download** / **Email** / **Regenerate**
- See `docs/paid-invoice-pdf-spec.md`

## Not implemented

- Stripe one-off Checkout (deferred / optional — **not** the default one-off path; use Invoices module)
- Invoiless webhook → auto renewal
- Per-assignment invoice linking
- Delete customer does **not** remove Stripe/Invoiless externals

---

## Related docs

- `docs/vendor-agnostic-architecture.md`
- `docs/subscription-renewal-tracking.md`
- `PROJECT_CONTEXT.md` (append-only git log)
