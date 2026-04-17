# Subscription renewal tracking (TL Portal)

**Status:** design reference — partial implementation in app today; items marked _TBD_ are not built yet.

Use this doc when continuing work after context loss (e.g. "What about the automatic paid option?" or "invoice linking?").

## Business context

- Track Lucia sells subscription terms of **1, 3, 6, and 12 months** (see `SubscriptionOption.durationMonths` for public registration pricing).
- **Invoiless** is used for billing. TL Portal does not create Invoiless "recurring" in the primary flow; **retainer-style** (or workaround recurring) may apply. Operational truth for renewals should not depend only on Invoiless being correct.
- A single customer may have **multiple devices** with **different intervals** (e.g. three annual, one monthly). Renewal logic is **per active `ServiceAssignment`** (device + customer), not only per customer.

## Data model (today)

`ServiceAssignment` (see `prisma/schema.prisma`) already includes:

| Field | Role |
|--------|------|
| `startDate` | Anchor for service / billing period (optional in UI). |
| `endDate` | Assignment ended. |
| `status` | Includes `active`, `due_soon`, `overdue`, `suspended`, `cancelled`. |
| `intervalMonths` | Billing cycle length (1 / 3 / 6 / 12). |
| `nextDueDate` | Next renewal boundary for alerts and ops. |
| `invoilessRecurringId` | Optional link to Invoiless if staff enters it. |
| `lastInvoiceId` | Optional last invoice reference. |
| `lastPaymentStatus` | Optional payment snapshot. |

**Design intent:** treat **`intervalMonths` + `nextDueDate`** (and **`startDate`** when set) as the **TL mirror** of subscription timing. Invoiless remains authoritative for money when healthy; TL holds a copy so **due soon / lapsed** still surfaces if invoicing fails.

## Recommended approach: baseline + renew ladder (hybrid)

1. **On device assignment:** persist **`intervalMonths`** so the billing cycle is identified even if **`startDate`** / **`nextDueDate`** are still empty. UI should communicate "cycle set, anchor pending" when dates are missing.
2. **Anchor:** when first bill / go-live / contract start is known, set **`startDate`** and an initial **`nextDueDate`** (or derive once and store).
3. **Rolling forward:** after each completed period, advance **`nextDueDate`** by **`intervalMonths`** (or set explicitly from invoice period). _Manual path is the first implementation target; see below._

## Notifications (planned)

Thresholds discussed (relative to resolved renewal date / `nextDueDate`):

- **5 days before** renewal
- **3 days before** renewal
- **On renewal date**
- **Past due** (renewal date passed and period not marked satisfied)

_Implementation note:_ needs a daily job and a consistent timezone for "calendar day." Not necessarily implemented yet.

## Paid period handling

### Manual paid (target for first implementation)

- Staff marks a period as paid / rolls renewal in TL (e.g. action on assignment or customer device row).
- Updates: advance **`nextDueDate`**, optionally set **`lastInvoiceId`** / **`lastPaymentStatus`** if known.
- This is the **reliable default** when Invoiless webhooks, polling, or invoice-to-device mapping are unavailable.

### Automatic paid _(TBD — placeholder only)_

- **Idea:** when an invoice is **marked paid** in Invoiless, TL updates linked assignments and advances **`nextDueDate`** (with **idempotency** per invoice id so webhooks do not double-advance).
- **Requires:** reliable payment events (webhook or poll) and **invoice <-> assignment** scope. See "Invoice linking" below.
- **Status:** _not implemented — do not assume this exists in code._

## Invoice <-> multiple devices linking _(TBD — placeholder only)_

- **Idea:** explicitly associate a generated invoice (or line items) with **one or more** `ServiceAssignment` rows so one payment can renew several devices with correct per-device intervals.
- **Edge cases to design later:** partial pay, bundled vs per-line invoices, refunds, wrong line count, same customer / mixed terms.
- **Status:** _not implemented — linking is optional future work; no schema/UI commitment in this doc beyond the concept._

## Relationship to dashboard

`lib/admin/dashboard-stats.ts` already surfaces assignments by **`status`** (`due_soon`, `overdue`) and **`nextDueDate`** for active rows. Any new ladder logic should align with those queries or deliberately migrate them to **date-computed** urgency if `status` is not auto-maintained.

## File map (for agents)

| Area | Location |
|------|-----------|
| Schema | `prisma/schema.prisma` — `ServiceAssignment`, `SubscriptionOption` |
| Assignment date + billing term | `app/admin/devices/actions.ts` — `updateServiceAssignmentDates`, `assignDeviceToCustomer`, `registerDevice` |
| Device UI (active service) | `components/admin/device-service-assignment-edit-form.tsx` — **Manage device** `/admin/devices/[id]/edit#active-service` |
| Assign existing device | `components/admin/device-assign-customer-form.tsx` |
| Register new device + optional assign | `components/admin/device-register-form.tsx` |
| Customer service table (term column) | `app/admin/customers/[id]/page.tsx` |
| SIM detail (term + link) | `app/admin/sims/[id]/page.tsx` |
| Invoiless webhooks (inspect last payload) | `app/api/webhooks/invoiless/route.ts`, `lib/invoiless/verify-webhook-signature.ts` |
| Dashboard | `lib/admin/dashboard-stats.ts`, `app/admin/page.tsx` |
| Customer rollup | `lib/admin/customer-list.ts`, `app/admin/customers/*` |
| Interval parse / labels | `lib/subscription-options/display.ts` |

## Changelog (manual)

| Date | Note |
|------|------|
| 2026-04-15 | Doc added: hybrid baseline + ladder, manual paid first; automatic paid and invoice linking explicitly deferred. |
| 2026-04-15 | Billing term (`intervalMonths`) editable on Manage device; also on assign/register flows; SIM detail shows term + link. |
| 2026-04-16 | Invoiless webhook receiver `POST /api/webhooks/invoiless` + signature helper; GET inspect last payload (dev / debug token). |
