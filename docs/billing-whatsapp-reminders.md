# Billing WhatsApp reminders (Twilio)

Automated subscription payment nudges via **Twilio Content** templates, separate from **Invoiless email** reminders.

## Schedule (calendar days, `BILLING_REMINDER_TIMEZONE`)

| Kind | Offset vs `nextDueDate` | Twilio env |
|------|-------------------------|------------|
| `due_5d` | 5 days before | `TWILIO_WA_TEMPLATE_DUE_5_DAYS` |
| `due_3d` | 3 days before | `TWILIO_WA_TEMPLATE_DUE_3_DAYS` |
| `due_0d` | Due today | `TWILIO_WA_TEMPLATE_DUE_TODAY` |
| `overdue_3d` | 3 days after | `TWILIO_WA_TEMPLATE_OVERDUE_3_DAYS` or `TWILIO_WA_TEMPLATE_OVERDUE` |
| `overdue_5d` | 5 days after | `TWILIO_WA_TEMPLATE_OVERDUE_5_DAYS` or `TWILIO_WA_TEMPLATE_OVERDUE` |

Cron: `GET /api/cron/billing-whatsapp-reminders` daily **04:15 UTC** (`vercel.json`), `Authorization: Bearer CRON_SECRET`.

## Who gets a message

- Active `ServiceAssignment` with `nextDueDate` matching the offset.
- `Customer.phone` set (sent as `whatsapp:+…`).
- **Pre-due (5/3/0):** manual/Invoiless customers; Stripe customers with `pending_payment`, `past_due`, `unpaid`, or non-active sub. **Skipped** when Stripe sub is `active` (auto-bill expected).
- **Overdue (+3/+5):** manual customers; Stripe attention statuses; or any assignment with ops urgency `overdue`.

## Pay link (`{{4}}`) resolution order

1. Open Stripe **hosted invoice** URL (`BillingInvoice.hostedInvoiceUrl`)
2. Invoiless public preview (`/i/{id}`) from mirror or `lastInvoiceId`
3. New Stripe **Checkout** session (only `pending_payment` + `stripe_subscription`)
4. If none: **skip send** (default) — logged as `skipped_no_pay_link`

### Fallback policy

| Mode | Behavior |
|------|----------|
| Default | **Do not send** customer WhatsApp without a real pay URL. |
| Staff SMS | Numbers in **Admin → Settings → Billing alert phones** receive an **SMS** (Twilio) with customer name, due timing, and link to **Customer → Billing**. One alert per customer × reminder × due date. |
| `TWILIO_WA_ALLOW_SEND_WITHOUT_PAY_LINK=true` | Optional: still send customer WhatsApp with `mailto:` support in `{{4}}` (not recommended). |

Staff alerts use **SMS** (no WhatsApp template required). Configure `TWILIO_SMS_FROM` or reuse `TWILIO_WHATSAPP_FROM` as the SMS sender.

Invoiless email reminders remain authoritative for invoice copy; WhatsApp is a short nudge with a single link.

## Idempotency

`BillingWhatsAppReminder` unique on `(customerId, reminderKind, nextDueDate)` — at most one WhatsApp per ladder step per due date.

## Env (Vercel)

See `.env.example` — `TWILIO_*`, template SIDs, `CRON_SECRET`, optional `BILLING_REMINDER_TIMEZONE` (default `America/Barbados`).
