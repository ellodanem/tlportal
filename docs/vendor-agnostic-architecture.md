# TL Portal — vendor-agnostic operational architecture

**Status:** Phase 1 approved (foundation).  
**Audience:** engineers and agents working in this repo.  
**Scope:** operational control layer above vendors — not a telematics platform rebuild.

---

## North star

TL Portal is the **system of record for operations**: customers, hardware, service assignments, renewals, and staff workflows. Vendors are **replaceable adapters** for money, connectivity, and (later) GPS data.

```text
Customer / staff
       ↓
  TL Portal (canonical IDs + workflows)
       ↓
  ┌────────────┬────────────┬────────────┐
  │  Billing   │    SIM     │    GPS     │
  │  adapters  │  adapters  │  adapters  │
  └────────────┴────────────┴────────────┘
  Invoiless, Stripe    1NCE      Traqcare → future vendors
```

**Rules**

1. Application code uses **TL UUIDs** (`Customer`, `Device`, `ServiceAssignment`).
2. Vendor IDs live on **link/account** tables, not scattered on core entities.
3. Pages and server actions call **`lib/services/*`**, not vendor HTTP clients directly.
4. Do not build low-level telemetry infrastructure in Phase 1.

---

## Current coupling (baseline)

| Vendor domain | Where coupled today | Neutral already |
|---------------|---------------------|-----------------|
| GPS (Traqcare) | `Customer.traqcare*` fields; UI labels | `Device`, `ServiceAssignment` |
| Billing (Invoiless) | `Customer.invoilessCustomerId`, `lib/invoiless/*`, invoices admin | `SubscriptionOption`, assignment dates |
| SIM (1NCE) | `lib/nce/*`, `SimCard` shape from 1NCE sync | ICCID as hardware id |
| Stripe | Planned; not in repo yet | — |

If the GPS provider changed tomorrow: **TL inventory and billing ops would keep working**; staff/customer map access would break until a new adapter + links exist.

---

## Canonical models (target)

### Core (keep / clarify)

| Entity | Role |
|--------|------|
| **Customer** | Account, contact, tags, notes — **no** vendor IDs long-term |
| **Device** | Physical tracker; **IMEI** unique; lifecycle status |
| **DeviceModel** | Hardware catalog |
| **Sim** (`SimCard`) | Cellular identity (ICCID) |
| **ServiceAssignment** | Device in service for customer; **ops** renewal (`intervalMonths`, `nextDueDate`) |
| **SubscriptionOption** | Public plan catalog (1/3/6/12 mo, XCD) |

### Phase 1 additions

| Entity | Role |
|--------|------|
| **BillingAccount** | One row per customer **per billing provider** (Invoiless, Stripe) |
| **ProviderDeviceLink** | Maps TL `Device` → vendor device/account (GPS today: Traqcare) |
| **OperationalEvent** | Append-only TL-native audit trail for ops + future automation |

### Later (not Phase 1)

| Entity | When |
|--------|------|
| **ProviderConnection** | Multi-brand / multi-tenant vendor credentials (Phase 2) |
| **Vehicle** | Rental / plate-centric workflows (Phase 2, if needed) |
| **UsageSnapshot** | SIM usage history for trends (Phase 2) |
| **TelemetryEvent**, **Alert** | Ingest or webhooks (Phase 3+) |

### Subscription vs assignment

- **Billing subscription** (Stripe): usually **per customer** — card, portal, `past_due`, etc.
- **ServiceAssignment**: **per device** — install state, fleet counts, ops `nextDueDate`.

Do not merge these into one table.

---

## Folder layout (approved)

```text
lib/
  domain/                 # Types, enums, small pure helpers (no fetch)
    events.ts
    providers.ts
  ports/                  # Interfaces (contracts)
    billing.ts
    sim.ts
    gps.ts                # Minimal Phase 1 (portal URL / link metadata)
  adapters/
    billing/
      invoiless/
      stripe/             # Phase 1 when Stripe ships
    sim/
      once/
    gps/
      traqcare/           # Link + portal URL; no API required Phase 1
  services/               # Use cases — called from server actions & cron
    billing-service.ts
    sim-sync-service.ts
    device-link-service.ts
    operational-event-service.ts
  # Existing modules remain during migration; shrink direct imports over time.
```

**Webhooks:** `app/api/webhooks/{provider}/route.ts` → verify signature → `services/webhook-service.ts` → adapter → DB.

**Prisma:** schema in `prisma/schema.prisma`; migrations as usual.

---

## Port contracts (minimal)

### BillingPort

- `ensureCustomer`, optional `createCheckoutSession`, `createPortalSession`, `listInvoices`
- Implementations: `invoiless`, `stripe`
- Selection: `BillingAccount.provider` + customer `billingMode`

### SimPort

- `listSims`, `getSim`, `getUsage(iccid, range)`
- Implementation: `1nce` only today

### GpsPort (Phase 1 — thin)

- `portalUrlForDevice(link)`, optional `externalIdFromImei` stub
- No position ingest in Phase 1

---

## Phase 1 deliverables

See **[phase-1-vendor-foundation-plan.md](./phase-1-vendor-foundation-plan.md)** for ordered tasks, migrations, and acceptance criteria.

Summary:

1. Schema: `BillingAccount`, `ProviderDeviceLink`, `OperationalEvent`; migrate Invoiless + Traqcare data.
2. Refactor Invoiless behind `BillingPort` + `billingService`.
3. Refactor 1NCE behind `SimPort` + `simSyncService`.
4. Traqcare: links + portal launcher; deprecate password on customer form (read-only legacy).
5. Stripe billing (approved separately): implement via `BillingPort`, not ad hoc on `Customer`.
6. Renewal UX: derive dashboard urgency from `nextDueDate` (or document manual status).
7. `OperationalEvent` writes on key staff actions.
8. Architecture doc + runbook updates.

---

## Telemetry (deferred)

**Now:** `ProviderDeviceLink`, domain types for future `TelemetryEvent` / `Alert` in `lib/domain/` only.

**Later:** webhook/poll ingest, snapshots, rules, FleetGuardian.

**Never (unless product demands):** full trip database, map tile stack, enterprise event bus.

---

## Migration / failover (design intent)

- **ProviderDeviceLink** with `role`: `primary` | `secondary` | `migrating`
- Soft-unlink: set `unlinkedAt`, do not delete history
- Customer “Open tracking” resolves link → adapter → URL (stable TL button)
- Billing and GPS migrations are **independent**

---

## AI / automation readiness (Phase 1 slice)

- **`OperationalEvent`** with categories: assignment, device, sim, billing, registration, staff
- **Webhook idempotency** pattern for Stripe (and generalize Invoiless when handlers exist)
- No ML in Phase 1

---

## Stripe subscriptions (MVP)

- **Mode:** `Customer.billingMode = stripe_subscription` (one Stripe subscription per customer).
- **Flow:** Admin → customer edit → billing panel → Checkout; webhooks update `BillingAccount` (`provider: stripe`).
- **Custom rates:** `Customer.stripeMonthlyRateXcd` (e.g. $25 or $20/mo); Checkout builds a dynamic Stripe price when set, or when you pick a non-default rate for one session.
- **Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` or `SubscriptionOption.stripePriceId`, `APP_BASE_URL`.
- **Local webhooks:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- **Invoiless** remains for `manual_legacy` customers.

---

## Billing direction (locked — 2026-05)

**Keep subscription-first for recurring service** (current Stripe Checkout + subscription + auto-renew). Do **not** switch to invoice-first recurring (generate invoice → email link → pay) for service plans at this time.

**Rationale:** subscription-first matches set-and-forget card billing and custom monthly rates ($20 / $25 / $30). `BillingInvoice` mirror is for **per-client tracking and PDFs**, not replacing the subscription anchor.

**Planned next (not built yet): paid invoice PDF**

- After `invoice.paid`, generate a **TL-branded PDF receipt** (large **PAID**, Zoho-style layout) stored on `BillingInvoice`; download / reshare / email from **Billing** tab.
- **Invoice # (locked):** customer-facing **`TL-INV-{serial}`**; Stripe `invoice.number` and `in_…` stored for reconciliation only (see [paid-invoice-pdf-spec.md](./paid-invoice-pdf-spec.md)).
- Stripe hosted PDF / **View** link remains secondary.

**Then: one-off invoices for hardware**

- Same PDF template and `TL-INV` numbering; Checkout `mode: payment`; `kind: one_time` on `BillingInvoice`.
- **Out of scope:** invoice-first recurring for service plans; Invoiless duplicate for Stripe customers.

---

## Related docs

| Doc | Topic |
|-----|--------|
| [paid-invoice-pdf-spec.md](./paid-invoice-pdf-spec.md) | Paid PDF layout, TL-INV numbering, implementation checklist |
| [phase-1-vendor-foundation-plan.md](./phase-1-vendor-foundation-plan.md) | Implementation plan |
| [subscription-renewal-tracking.md](./subscription-renewal-tracking.md) | Renewal ladder / Invoiless |
| README.md | Env vars, deploy |

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-18 | Initial architecture + Phase 1 approval |
| 2026-05-19 | Stripe Checkout + webhooks + admin billing panel |
| 2026-05-21 | Public pay thanks/cancel URLs; Billing tab; BillingInvoice mirror |
| 2026-05-21 | Locked: subscription-first recurring; plan one-off hardware invoices next |
| 2026-05-21 | Paid invoice PDF spec; TL-INV display numbers (Stripe # secondary) |
