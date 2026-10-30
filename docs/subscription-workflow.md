# Subscription workflow (unified)

## Domain model (canonical records)

- A **customer** has many `CustomerSubscription` rows. Each is one billing arrangement with its own
  cadence (`billingIntervalMonths`), `currency`, `collectionMethod`, renewal (`nextBillingDate`) and lifecycle.
  Different cadences (for example one annual and one monthly) are separate subscriptions and are
  **never added together** in the UI. Matching renewal dates never merge subscriptions.
- A **`SubscriptionItem`** is one billable service (vehicle/asset). Its price is an effective-dated
  `SubscriptionItemRate`. Hardware is a `ServiceAssignment` linked by `subscriptionItemId`.
- A **`SubscriptionItemInitialAdjustment`** records an *agreed* partial-period charge for the time between a
  service starting and joining the renewal (`daily_proration`, `monthly_rounded` or `manual_amount`).
  It stores the agreed amount, the daily-formula amount for comparison, the reason and the authoriser.
  It is **not** an invoice. `invoiceId` is set only when staff explicitly create the invoice.
- `creationKey` (unique, nullable) on `CustomerSubscription` and `SubscriptionItem` makes wizard and
  add-service submissions idempotent.

## Screens

| Route | Purpose |
| --- | --- |
| `/admin/subscriptions/canonical/new` | Six-step wizard: Customer, Plan, Customize, Hardware, Billing, Review. Saves a **draft**. |
| `/admin/subscriptions/canonical/[id]` | The single subscription details screen. One primary **Add service** action; everything else under **More** or **Advanced details**. |
| `/admin/subscriptions/canonical/[id]/add-service` | Three-step contextual add-service flow (service and price, hardware, review). |
| `/admin/customers/[id]/subscriptions` | Compact list of the customer's subscriptions, each linking to its details screen. |

## Safety contract

- Saving a wizard draft, adding a service, or recording an agreed partial-period charge never creates an
  invoice, charges anyone, calls Stripe, or notifies a customer.
- Creating the invoice for an agreed charge (`createServiceAdjustmentInvoiceAction`) needs the reviewed preview
  token plus an explicit confirmation, creates an **open, unsent** invoice, and is disabled in production until
  `CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED=true` (the same owner-controlled flag as activation).
- Activation stays staff-confirmed. A subscription that starts part-way through its cycle defaults to the
  deferred first-invoice option so a full-period advance invoice cannot over-bill it.

## Migration `20261030120000_subscription_service_adjustments`

Additive only: one enum, two nullable `creationKey` columns with unique indexes, one new table with
foreign keys and CHECK constraints. No existing row is read, rewritten or deleted. Rollback (only if nothing has
been written) is in the migration header.

## Read-only reconciliation

```powershell
node --env-file=.env.local --import tsx scripts/customer-subscription-reconciliation.ts "<customer name>"
```

Prints how a customer's subscriptions, services, schedules, Stripe links and paid invoices are structured,
grouped by cadence, with consolidation blockers. It never writes.
