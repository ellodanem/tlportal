# Canonical Stripe live canary runbook

Phase 3B3B prepares one genuine, owner-approved monthly XCD subscription. It does not authorize deployment, a live API call, Checkout creation, payment, cancellation, migration, or general canonical billing.

## Fixed pilot boundary

- One environment-allowlisted customer and one environment-allowlisted canonical subscription.
- Activation only. Bulk migration and live provider synchronization are not authorized.
- Monthly XCD billing only.
- Approved recurring total must be greater than EC$0 and no more than EC$5.00.
- Tax must be explicitly reviewed and zero for this initial canary. The code does not enable Stripe Tax or silently add tax.
- No currency fallback, conversion, fee gross-up, or amount increase is permitted.
- The canonical renewal date is sent as the Stripe billing anchor with `proration_behavior=none`.

General canonical execution remains production-disabled. The live adapter is reachable only through the separate `stripe_live_canary` path.

## Authorization layers

All layers are required:

1. Vercel Production context (`NODE_ENV=production` and `VERCEL_ENV=production`).
2. `CANONICAL_STRIPE_LIVE_CANARY_ENABLED=true`.
3. Exact customer, subscription, Stripe account, and owner-email allowlists.
4. Existing live `STRIPE_SECRET_KEY` and signed `STRIPE_WEBHOOK_SECRET` configuration.
5. A separate approval secret of at least 32 bytes.
6. A signed owner authorization valid for no more than 24 hours. It records the exact operation, canonical operation key and proposal digest, customer, subscription, provider account and mode, currency, recurring amount, tax, total, renewal date, cancellation procedure, and explicit confirmation that the account-specific minimum charge was checked.
7. A durable, explicitly approved `BillingOperation` whose immutable proposal matches that authorization.
8. Provider-account verification through `accounts.retrieve()` before any provider operation.

The live adapter validates this authorization again immediately before a mutation and accepts only the operation-derived idempotency key. An environment variable or direct adapter call alone cannot create or alter a live Stripe object.

## Stripe account and currency preflight

Stripe's supported-currency documentation lists XCD as a supported presentment currency and states that minimum charges depend on the account's payout-bank settlement currency. This repository has not queried the production Stripe account, so EC$5 suitability remains unverified for that specific account.

Before a future canary execution, the owner must verify in Stripe Dashboard that:

- the configured account ID matches the allowlist;
- live payments and XCD presentment are enabled for the account and intended payment method;
- EC$5 is above the applicable minimum for the account's settlement currency;
- no automatic tax, currency conversion, or fee gross-up changes the owner-approved EC$5 total.

If any check fails, stop. Do not substitute USD or increase the amount.

## Production webhook

The canary reuses `/api/webhooks/stripe` and its existing Stripe signature secret. No separate test endpoint is used. The live-canary handler runs before general canonical and legacy fulfillment and requires exact Phase 3B3B operation ownership. A canary-looking event with incomplete ownership fails closed instead of falling through to legacy billing.

The existing endpoint must be subscribed to:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.voided`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

The repository cannot verify Stripe Dashboard endpoint configuration without account access. The owner must inspect it before deployment. No Dashboard change is authorized in Phase 3B3B.

## Monitoring checklist

After a separately authorized execution:

1. Confirm one `BillingOperation`, one Checkout Session, and the expected operation key.
2. Confirm Checkout is completed by the approved customer.
3. Confirm the live Stripe subscription has the exact canonical subscription ID, authorization ID, XCD Price, quantity, EC$5-or-less total, and preserved renewal anchor.
4. Confirm `invoice.paid` delivery succeeds in Stripe Dashboard.
5. Confirm one local `BillingInvoice`, one payment identifier, immutable item attribution, and a completed provider relationship reconciliation.
6. Confirm no other customer's subscription, canonical operation, legacy subscription, service status, or cron behavior changed.
7. On failure, inspect the durable operation status. Do not create another Checkout Session manually; use idempotent recovery or stop for review.
8. A failed payment may set collection attention to `past_due`; it must not automatically suspend tracking service.

## Cancellation and renewal protection

Cancellation requires the completed canary operation, exact provider ownership, a fresh signed owner authorization specifically for `cancel_subscription_at_period_end` and the exact provider subscription ID, and the literal confirmation phrase:

`CANCEL <Stripe subscription ID> AT PERIOD END`

The adapter requests `cancel_at_period_end=true`, disables proration, verifies the renewal anchor did not change, and verifies Stripe returned `cancel_at_period_end=true`.

After cancellation, the operator must confirm:

- Stripe shows cancellation at period end;
- the `customer.subscription.updated` webhook was delivered;
- the final local provider status reconciles;
- after the period ends, Stripe shows the subscription canceled and no later invoice or charge exists.

Never delete genuine invoices, payments, BillingOperations, provider links, or accounting history to clean up the pilot.

## Preview and deployment isolation

`VERCEL_ENV=production` is mandatory for the live canary. Preview deployments cannot satisfy the gate. The validation branch remains excluded from Vercel in `vercel.json`. This phase does not change cron schedules or migration behavior and adds no database migration.

## Owner run sheet (single customer, amount above EC$5)

The owner-run runner is `scripts/canonical-stripe-live-canary.ts`. It acts only on the subscription in `CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID`, never prints a secret, and every mutating step needs a typed confirmation.

**Raising the cap.** The EC$5 default can be raised with `CANONICAL_STRIPE_LIVE_CANARY_MAX_RECURRING_AMOUNT` (for example `50.00`), hard-limited to EC$100.00. It must be set identically in Vercel Production, because the webhook re-checks the signed authorization against it; if it is missing there, paid-invoice events for the canary are rejected.

**Settings to add in Vercel Production (then redeploy):** `CANONICAL_STRIPE_LIVE_CANARY_ENABLED=true`, `..._CUSTOMER_ID`, `..._SUBSCRIPTION_ID`, `..._STRIPE_ACCOUNT_ID` (`acct_...`), `..._OWNER_EMAIL`, `..._APPROVAL_SECRET` (at least 32 random bytes, never pasted into chat or committed), and `..._MAX_RECURRING_AMOUNT`. Remove them after the pilot.

**Steps:**
1. `check` — read-only; every setting verified.
2. Verify in the Stripe Dashboard: account ID, XCD card payments, minimum charge, webhook events listed above.
3. `convert` — switches the subscription to Stripe collection and PAUSES its recurring invoice schedules (reversible).
4. `prepare` — review the exact proposal.
5. `sign` — six typed confirmations; writes a signed authorization valid under 24 hours to `.canary/authorization.json` (git-ignored).
6. `approve` then `execute` — creates the one Checkout Session. Send the customer the link.
7. After the customer pays and `status` shows the Stripe link: `finalize` (ends the paused invoice schedules).
8. If Checkout is never completed: `revert` (only allowed while no Stripe subscription exists). Otherwise nobody bills the customer.
9. To stop: `sign --cancel <sub_id>`, then `cancel <sub_id>` (cancels at period end).

The single-use rule still applies: only one canary operation may ever exist.

**Screen instead of the runner.** On the allowlisted subscription's Billing tab, the configured owner (the signed-in user whose email equals `CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL`) sees "Live test: create the Stripe subscription from TL Portal". It shows the exact charge, renewal date and cap, requires six ticked confirmations plus typing `CREATE`, then switches the subscription, signs, approves and creates the one Checkout in a single guarded step, and shows the link to send the customer. If anything fails before the durable approval exists, the switch is undone automatically. After the customer pays and Stripe is linked, a **Finish** button ends the paused recurring invoices. Everyone else (and every other subscription) sees nothing. Cancellation stays in the runner (`sign --cancel`, `cancel`).
