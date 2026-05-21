# Phase 1 — vendor foundation implementation plan

**Prerequisite:** [vendor-agnostic-architecture.md](./vendor-agnostic-architecture.md) approved.  
**Goal:** Stop new vendor coupling, introduce link/account tables, ports + services, Traqcare migration, billing refactor, operational events — **without** telemetry ingest.

**Estimated touch:** ~20–35 files, 2–3 Prisma migrations, no change to proposal PDF pipeline.

---

## Workstreams

Phase 1 runs as **three parallel workstreams** after schema lands. They are independent enough for one developer to sequence or two to parallelize with clear boundaries.

| ID | Workstream | Outcome |
|----|------------|---------|
| **A** | Schema + domain + events | Tables, enums, `lib/domain`, `operational-event-service` |
| **B** | Billing port | Invoiless behind `BillingPort`; Stripe via same port; `BillingAccount` |
| **C** | SIM port + GPS links | 1NCE behind `SimPort`; Traqcare → `ProviderDeviceLink` |

Workstreams **B** and **C** should not modify the same server actions in one PR without coordination. **A** merges first.

---

## Milestone 0 — Schema & domain (merge first)

### M0.1 Prisma migration

Add enums:

```prisma
enum BillingProvider {
  invoiless
  stripe
}

enum BillingMode {
  manual_legacy      // Invoiless / offline invoices
  stripe_subscription
}

enum ProviderCode {
  traqcare
  once
  // reserve: stripe not needed on device links
}

enum DeviceLinkRole {
  primary
  secondary
  migrating
}
```

**`BillingAccount`**

| Field | Notes |
|-------|--------|
| `id` | uuid |
| `customerId` | FK → Customer |
| `provider` | `BillingProvider` |
| `externalCustomerId` | `cus_` / Invoiless id |
| `mode` | `BillingMode` |
| `status` | nullable mirror (Stripe sub status, etc.) |
| `metadata` | Json? |
| `createdAt` / `updatedAt` | |

Unique: `[customerId, provider]`, `[provider, externalCustomerId]` where external id set.

**`ProviderDeviceLink`**

| Field | Notes |
|-------|--------|
| `id` | uuid |
| `deviceId` | FK → Device |
| `provider` | `ProviderCode` (gps vendors expand enum later) |
| `externalDeviceId` | nullable until known |
| `externalAccountRef` | nullable (portal user / fleet id) |
| `portalUrl` | nullable |
| `role` | `DeviceLinkRole` @default(primary) |
| `linkedAt` | DateTime |
| `unlinkedAt` | nullable |

Unique: `[deviceId, provider, role]` where `unlinkedAt` null — or partial unique in app logic if Prisma partial indexes are awkward.

**`OperationalEvent`**

| Field | Notes |
|-------|--------|
| `id` | uuid |
| `occurredAt` | DateTime @default(now()) |
| `category` | String (typed in app) |
| `customerId`, `deviceId`, `actorUserId` | optional FKs |
| `summary` | String |
| `payload` | Json? |

Indexes: `[customerId, occurredAt]`, `[deviceId, occurredAt]`, `[category, occurredAt]`.

**`Customer` changes (Phase 1)**

- Add `billingMode` `BillingMode` @default(manual_legacy) **or** derive from presence of Stripe `BillingAccount` only — pick one source of truth (recommend: `billingMode` on Customer for fast UI).
- Keep `invoilessCustomerId` + `traqcare*` temporarily; mark `@deprecated` in comments.

### M0.2 Data migration SQL (same or follow-up migration)

1. For each `Customer` with `invoilessCustomerId`: insert `BillingAccount` `{ provider: invoiless, externalCustomerId, mode: manual_legacy }`.
2. For each `Customer` with any `traqcare*` set: **do not** auto-create device links (no device association on customer). Migration script or staff tool links per device later.
3. Optional one-time script: copy `traqcarePortalUrl` + username into a **customer-level** metadata JSON on `BillingAccount` or new `CustomerPortalPreference` — **prefer:** only migrate to **device links** when staff edits device (see C).

### M0.3 `lib/domain/`

- `providers.ts` — `ProviderCode`, display names
- `events.ts` — `OperationalEventCategory` union
- `billing.ts` — `BillingMode`, DTOs

### M0.4 `operational-event-service.ts`

- `recordEvent({ category, customerId?, deviceId?, summary, payload?, actorUserId? })`
- Called from actions (incrementally)

**Acceptance:** migrate deploy succeeds; existing customers retain Invoiless behavior; no UI regression.

---

## Milestone 1 — Ports & services shell

### M1.1 Create folders

`lib/ports/*`, `lib/adapters/*`, `lib/services/*` per architecture doc.

### M1.2 `billing-service.ts`

- `syncCustomerToBilling(customerId, provider?)` — wraps today’s Invoiless sync
- `getBillingAccounts(customerId)`
- `setBillingMode(customerId, mode)` — gates Stripe vs legacy
- Reads/writes `BillingAccount`, not `Customer.invoilessCustomerId` (adapter still updates both during transition)

### M1.3 `sim-sync-service.ts`

- Move `executeOneNceSimsInventoryImport` call path here from direct lib usage
- Cron route calls service only

### M1.4 `device-link-service.ts`

- `getPrimaryGpsLink(deviceId)`
- `upsertGpsLink({ deviceId, provider, portalUrl, externalDeviceId?, externalAccountRef? })`
- `unlinkGpsLink(deviceId, provider)`

**Acceptance:** no behavior change yet; existing tests/manual smoke pass.

---

## Milestone 2 — Workstream B: Billing port

### M2.1 `adapters/billing/invoiless/*`

Move from `lib/invoiless/*` incrementally:

- `client.ts` → adapter internal
- `customer-sync.ts` → `ensureCustomer` on port
- `invoice-mutate.ts`, `invoices-list.ts` → port methods

`lib/invoiless/*` re-exports or thin-wraps adapter for one release to avoid huge diff.

### M2.2 Update call sites

| Before | After |
|--------|--------|
| `syncCustomerToInvoiless` in `customers/actions` | `billingService.syncCustomer` |
| `app/admin/invoices/*` | `billingService` / port |
| Dashboard unlinked count | Count customers without `BillingAccount` where `provider=invoiless` OR without any account for legacy mode |

### M2.3 Stripe (parallel track)

Implement per separate Stripe Phase 1 spec:

- `adapters/billing/stripe/*`
- `BillingAccount` rows for Stripe
- Webhook → update `BillingAccount.status`
- **Do not** add Stripe fields to `Customer` except `billingMode` if needed

Invoiless and Stripe UI gated by `billingMode` / account presence.

**Acceptance:** Invoiless sync + invoices unchanged for legacy customers; Stripe customers use port only.

---

## Milestone 3 — Workstream C: SIM port + GPS links

### M3.1 `adapters/sim/once/*`

- Wrap `lib/nce/*` behind `SimPort`
- `sim-sync-service` only entry for cron + admin import

### M3.2 Traqcare / GPS link UI

**Device edit** (`/admin/devices/[id]/edit`):

- Section **GPS provider**
  - Provider select (Traqcare only in Phase 1)
  - Portal URL, external device id (optional), account/username ref
  - Saves `ProviderDeviceLink`
- **Remove** Traqcare fields from **customer** form over time:
  - Phase 1b: customer form shows read-only legacy Traqcare with banner “Moved to per-device GPS link”
  - Phase 1c: stop writing `traqcarePassword`; optional clear script

**Customer 360:**

- “Open tracking” → primary device’s link or message “Configure GPS link on device”

### M3.3 `adapters/gps/traqcare/*`

- `portalUrlForDevice(link)` → returns `link.portalUrl` or default
- No HTTP API Phase 1

**Acceptance:** Staff can open Traqcare from device; customer-level passwords optional/deprecated.

---

## Milestone 4 — Renewal & dashboard cleanup

### M4.1 `nextDueDate` urgency

Pick **one**:

- **Option A (recommended):** Dashboard/customer list compute `opsUrgency` from `nextDueDate` vs today (due in 7d, overdue) — ignore unused `ServiceAssignment.status` values `due_soon`/`overdue` until staff can set them.
- **Option B:** Nightly cron sets `status` from dates.

Document in `subscription-renewal-tracking.md`.

### M4.2 Operational events wired

Emit events on:

- `registerDevice`, `assignDeviceToCustomer`, `unassignDeviceFromCustomer`
- `approveRegistrationRequest` / reject
- `syncCustomer` (billing)
- `importSimsFromOneNce` (summary count)
- `upsertGpsLink`

**Acceptance:** Customer detail shows optional “Recent activity” (last 10 events) — small UI addition.

---

## Milestone 5 — Hardening & docs

- [ ] `.env.example` comments for Stripe + unchanged Invoiless/1NCE
- [ ] README link to architecture doc
- [ ] Deprecation comments on `Customer.invoilessCustomerId`, `traqcare*`
- [ ] `grep` gate: no new `invoilessJson` / `nceJson` outside `adapters/`
- [ ] Manual test checklist (below)

---

## Manual test checklist

- [ ] Legacy customer: Invoiless sync, create invoice, list invoices
- [ ] Customer without Invoiless: dashboard still works
- [ ] Register device → assign → set `nextDueDate` → appears on dashboard upcoming
- [ ] 1NCE import (manual + cron auth) updates SIMs
- [ ] Device GPS link: save portal URL → open link works
- [ ] Stripe (when enabled): checkout → webhook → `BillingAccount` status; legacy customer unaffected
- [ ] Operational events appear on customer or device after actions

---

## PR sequencing (suggested)

| PR | Contents |
|----|----------|
| 1 | Schema + domain + operational event service (no UI) |
| 2 | Ports shell + sim-sync + billing-service wrappers (Invoiless still works) |
| 3 | Invoiless adapter move + BillingAccount reads |
| 4 | Device GPS link UI + traqcare adapter |
| 5 | Dashboard renewal + activity feed |
| 6 | Stripe adapter (if not already merged in parallel branch) |

---

## Out of scope (Phase 1)

- Telemetry ingest, Alert table, FleetGuardian rules
- `ProviderConnection` multi-tenant
- Vehicle entity
- Customer-facing TL map
- Removing Invoiless invoice admin
- Full deletion of `Customer.traqcare*` / `invoilessCustomerId` columns (deprecate only)

---

## Rollback

- Migrations are additive; feature flags: `STRIPE_BILLING_ENABLED`, keep Invoiless paths
- Revert PRs in reverse order; link tables can remain empty without breaking legacy fields until column drop in Phase 2

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-18 | Phase 1 plan created |
| 2026-05-18 | Implementation started: schema, ports/adapters/services, GPS link UI, billing/sim refactor, ops urgency |
