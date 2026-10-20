# Billing notification handoff

## Purpose

This document captures the customer billing-notification work completed on 17 October 2026 so another agent/chat can safely continue it.

Implementation commit: `6c2604c` — `feat(billing): add invoice notification delivery`

## Scope implemented

Customer billing notifications now use **Email and WhatsApp only**. Do **not** add customer SMS; SMS opt-in and carrier-compliance requirements were intentionally avoided.

The daily notification cron is still:

```text
GET /api/cron/billing-whatsapp-reminders
```

It runs once daily at 04:15 UTC in `vercel.json`, which is compatible with the Vercel Hobby once-per-day cron limit.

The scheduler was changed from an assignment-date WhatsApp-only ladder to an invoice-based Email + WhatsApp process. It evaluates the actual native TL invoice `dueDate`, amount outstanding, invoice status, archive status, customer archive status, and availability of a safe customer payment URL.

## Notification cadence

| Billing method | Event | Channels |
|---|---|---|
| Manual / cheque | 5, 3, and 1 day before due | Email + WhatsApp |
| Manual / cheque | 1, 3, and 7 days overdue | Email + WhatsApp |
| Manual / cheque | 8 days overdue | Email + WhatsApp final warning |
| Stripe automatic billing | 3 days before due | Email + WhatsApp automatic-charge notice |
| Stripe automatic billing | Successful payment | Email + WhatsApp payment-received confirmation |
| Stripe automatic billing | Immediate card failure | Existing Email + WhatsApp decline flow |
| Stripe automatic billing | Still unpaid at 1, 3, and 7 days overdue | Email + WhatsApp |
| Stripe automatic billing | 8 days overdue | Email + WhatsApp final warning |

The original Stripe payment-declined workflow remains active and uses the existing `TWILIO_WA_TEMPLATE_PAYMENT_DECLINED` template.

## Safety behavior

- Email and WhatsApp delivery are independent. A failure in one channel does not block the other.
- Each automatic delivery is stored in `BillingNotificationDelivery`, with idempotency key, channel, destination, status, attempts, provider message SID, and error detail.
- Failed deliveries can be manually retried at **Customer → Billing → Billing notification history**. A retry rechecks that the invoice is still open and payable before sending.
- A paid, voided, written-off, archived, or no-longer-payable invoice is not resent.
- Day 8 creates a `billing.pause_pending` operational event for staff review. It does **not** automatically suspend service, a SIM, a device, or a Stripe subscription.
- The customer `paymentReminders` preference of `off` suppresses the scheduled program.

## Phone-number handling

Customer phone values are normalized and stored as E.164, for example:

```text
+17585551234
```

The customer create/edit form validates the number server-side and client-side guidance asks for a country code. Seven-digit local numbers are treated as Saint Lucia numbers (`+1 758`). Twilio receives the same number prefixed with `whatsapp:` only at send time.

## New Twilio Content templates

The WhatsApp environment variables were reported as updated and deployed by the project owner. They should map to approved **Utility**, English, text templates:

```text
TWILIO_WA_TEMPLATE_BILLING_MANUAL_UPCOMING
TWILIO_WA_TEMPLATE_BILLING_OVERDUE
TWILIO_WA_TEMPLATE_BILLING_PAUSE_WARNING
TWILIO_WA_TEMPLATE_BILLING_STRIPE_UPCOMING
TWILIO_WA_TEMPLATE_BILLING_PAYMENT_RECEIVED
```

The implementation supplies these variables to the first four templates:

| Variable | Value |
|---|---|
| `{{1}}` | Customer greeting name |
| `{{2}}` | Invoice number |
| `{{3}}` | Outstanding amount |
| `{{4}}` | Due date |
| `{{5}}` | Day count |
| `{{6}}` | Customer-safe payment or hosted-invoice URL |

The payment-received template receives:

| Variable | Value |
|---|---|
| `{{1}}` | Customer greeting name |
| `{{2}}` | Amount paid |
| `{{3}}` | Invoice number |

Exact approved template copy is documented in `docs/billing-whatsapp-reminders.md` and the user-facing handoff conversation. Keep template variable numbering unchanged unless the corresponding code in `lib/billing/invoice-notifications.ts` is changed.

## Deployment and database requirement

The implementation includes Prisma migration:

```text
prisma/migrations/20261017130000_billing_notification_delivery/migration.sql
```

It must be applied to the production database before the new notification cron can work:

```bash
npx prisma migrate deploy
```

The application was type-checked, linted, Prisma-schema validated, phone-format tested, and production-built with migrations skipped only because no production database connection was used during the implementation session.

## Main implementation files

| File | Role |
|---|---|
| `lib/billing/invoice-notifications.ts` | Invoice scheduler, delivery ledger, Email/WhatsApp sends, retry logic, Stripe payment success notifications |
| `app/api/cron/billing-whatsapp-reminders/route.ts` | Daily authenticated cron endpoint |
| `prisma/schema.prisma` | `BillingNotificationDelivery` schema and delivery enums |
| `components/admin/billing-notification-history.tsx` | Customer Billing history and failed-delivery retry UI |
| `app/admin/customers/billing-actions.ts` | Authorized manual retry server action |
| `lib/twilio/phone.ts` | E.164 WhatsApp phone normalization |
| `app/admin/customers/actions.ts` | Customer create/edit phone validation |
| `lib/stripe/webhook-handlers.ts` | Stripe paid-event success notification trigger |

## Known follow-up opportunities

- Add a central admin-wide failed-notification queue; the current retry view is customer-specific.
- Record the recurring-invoice initial WhatsApp notice at the exact moment a recurring invoice is generated. The due-date ladder is implemented; initial recurring-email delivery already existed.
- If automatic service suspension is desired, design it as a separate approved workflow covering service assignments, device/SIM operations, recurring schedules, Stripe subscriptions, restoration after payment, and staff review. Do not silently convert the existing day-8 `pause_pending` event into a device suspension.
- Confirm production migration state and test each new Content SID with a real customer-safe test invoice before enabling broad customer traffic.

## Workspace note

At the time of the implementation commit, unrelated pre-existing working-tree modifications to `PROJECT_CONTEXT.md` and `vercel.json` were preserved and left unstaged. Do not discard them without reviewing their source.
