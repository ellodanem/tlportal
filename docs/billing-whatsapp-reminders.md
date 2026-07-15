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
- **`Customer.paymentReminders` preference** (all reminder channels):
  - **`auto` (default):** manual/cash customers **on**; Stripe customers **off** (card failures use the payment-declined series instead).
  - **`on`:** always eligible (staff override).
  - **`off`:** never.
- Staff can change this on **Customer → Billing → Payment reminders**. The billing status strip shows the effective state.

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

## On-demand (manual triggers)

| Trigger | Where | Template env |
|---------|--------|----------------|
| Stripe payment link | Customer → Billing → **Send to customer** | `TWILIO_WA_TEMPLATE_STRIPE_PAYMENT_LINK` (resend: `_RESEND`) |
| New Invoiless invoice | Admin → Invoices → create (status not Draft) | `TWILIO_WA_TEMPLATE_INVOICE_NEW` |
| Payment declined | Auto on Stripe decline; resend on Customer → Billing → **Resend WhatsApp** | `TWILIO_WA_TEMPLATE_PAYMENT_DECLINED` |

Stripe payment-link templates should include an auto-charge line after the pay URL:

```
Once this payment link is paid, your card will *automatically* be charged every *{{5}}* from the payment date.
```

Variables: `{{1}}` first name · `{{2}}` amount/term/vehicles · `{{3}}` pay link · `{{4}}` validity (e.g. `24 hours`) · `{{5}}` billing term (`1 month` / `3 months` / …).

## Payment declined (Utility template)

On a Stripe card decline, `handleStripePaymentFailure` notifies the customer over **both** email and WhatsApp (independently), and alerts staff by SMS. Idempotent per Stripe PaymentIntent.

**Content template** — category **Utility**, type **Call to action** (URL button):

```
Hi {{1}}, we tried to process your card payment for {{3}} ({{4}}), but {{2}}. No money was taken.

Tap below to complete your payment securely. Need help? Just reply to this message.

— Track Lucia
```

- Button: **Visit website** → `Pay now` → `https://<domain>/pay/go/{{5}}`
- Variables: `{{1}}` first name · `{{2}}` short decline reason · `{{3}}` payment label (`your Track Lucia Subscription` / `TL-INV-…`) · `{{4}}` amount · `{{5}}` redirect token

**`/pay/go/{token}` redirect:** WhatsApp URL buttons require a fixed base domain, so the pay link is a stable `/pay/go/{token}` on our domain that 302-redirects to the real destination (native pay page or Stripe hosted invoice). The token is stored as `payLinkToken` on the `billing.payment_failed` operational event.

## Inbound WhatsApp (conversations)

Webhook: `POST /api/webhooks/twilio/whatsapp` — configure in Twilio as the WhatsApp sender’s “When a message comes in” URL.

- Stores inbound messages in `WhatsAppConversation` / `WhatsAppMessage`, matched to a customer by phone.
- Customer → **Messages** shows the thread; free-form reply is allowed while `lastInboundAt` is within 24 hours.
- Outside the window, use Message templates (approved Content templates only).
- Optional env: `TWILIO_WHATSAPP_WEBHOOK_URL` for exact signature validation URL.

## Env (Vercel)

See `.env.example` — `TWILIO_*`, template SIDs, `CRON_SECRET`, optional `BILLING_REMINDER_TIMEZONE` (default `America/Barbados`).
