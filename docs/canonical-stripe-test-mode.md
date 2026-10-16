# Canonical Stripe isolated test-mode verification

Phase 3B3A connects the approved canonical execution service to Stripe through a separate test-only adapter. It does not authorize production execution, customer migration, live charges, or production deployment.

## Compatibility baseline

- Stripe Node SDK: `17.7.0`.
- SDK default/API contract: `2025-02-24.acacia`.
- Canonical recurrence: 1, 3, 6, or 12 months. Twelve months maps to one Stripe year; the other terms map to Stripe month intervals with the matching `interval_count`.
- One canonical subscription uses one recurrence and currency. Mixed-interval Stripe subscriptions are not created.
- Stripe amounts are converted from exact canonical decimal values using an explicitly configured currency minor-unit exponent. Values that cannot be represented exactly are rejected.
- Provider updates always send `proration_behavior=none` and `billing_cycle_anchor=unchanged`.
- Existing legacy Stripe configuration, Checkout, customer records, and webhook endpoint are not used by this adapter.

## Required local/test configuration

Configure these only in an isolated non-production environment. Do not share their values in chat, source control, logs, screenshots, or CI output.

```text
CANONICAL_STRIPE_EXECUTION_ENABLED=true
CANONICAL_STRIPE_TEST_PROVIDER_ENABLED=true
CANONICAL_STRIPE_TEST_SECRET_KEY=<isolated sk_test_ key>
CANONICAL_STRIPE_TEST_WEBHOOK_SECRET=<signing secret for the isolated endpoint>
CANONICAL_STRIPE_TEST_SUCCESS_URL=http://localhost:3000/pay/thanks?session_id={CHECKOUT_SESSION_ID}
CANONICAL_STRIPE_TEST_CANCEL_URL=http://localhost:3000/pay/cancel
CANONICAL_STRIPE_TEST_CURRENCY=XCD
CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT=2
```

The adapter never falls back to `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`. Keys beginning with `sk_live_` or `rk_live_`, production runtime, Vercel Production, and provider objects whose `livemode` is not explicitly `false` are rejected.

## Isolated Stripe setup

1. Select Stripe test mode and verify the account indicator says test mode before creating anything.
2. Use an isolated test-mode secret key. Place it only in the local/test environment as `CANONICAL_STRIPE_TEST_SECRET_KEY`.
3. Forward Stripe test events to `http://localhost:3000/api/webhooks/stripe-canonical-test` with Stripe CLI, or create an equivalent test-mode Dashboard webhook endpoint.
4. Store that endpoint's `whsec_...` value as `CANONICAL_STRIPE_TEST_WEBHOOK_SECRET`.
5. Use a disposable local PostgreSQL database with synthetic customers, subscriptions, services, and devices. Do not point the run at Neon Production.
6. Confirm the synthetic canonical subscription is in canonical control, uses Stripe autocharge, has explicit rates, and has an explicitly approved `BillingOperation` before execution.
7. Use Stripe test payment methods only. Never enter a real customer's card, email, phone, or other personal data.

## Expected provider behavior

- A synthetic Stripe Customer is created or recovered by the internal synthetic customer identifier.
- Compatible recurring Prices are reused by a deterministic fingerprint; an incompatible Price using that fingerprint blocks execution.
- Activation creates a multi-item subscription Checkout Session with exact quantities and recurring Prices.
- Synchronization verifies exact subscription ownership before changing items.
- Quantity, Price replacement, rate-group addition, and retirement updates preserve the billing anchor and produce no Stripe prorations.
- Monthly additions begin in recurring Stripe billing at the next renewal. Annual additions use the separately authorized native adjustment workflow for the mid-cycle amount and enter Stripe recurring billing at the preserved anniversary.
- Timeouts are recovered through Checkout metadata, Stripe idempotency keys, subscription operation metadata, and the durable local `BillingOperation`.

## Webhook behavior

The isolated endpoint verifies the raw payload against the dedicated test webhook secret and rejects live-mode events. It routes only through canonical ownership handling; it does not fall through to legacy fulfillment. Existing replay claims, out-of-order event timestamps, exact invoice attribution, payment reconciliation, failed-payment attention, and retry-required behavior remain in force.

## Automated validation boundary

Automated tests inject a Stripe-compatible client and synthetic PostgreSQL fixtures. GitHub Actions must not receive Stripe keys and must not call Stripe. A real Stripe test-mode end-to-end run requires separate owner approval after this phase is reviewed.

## Known test-mode limitations

- Activation recovery scans the most recent 100 Checkout Sessions in the isolated account because Checkout Session metadata is not directly searchable.
- A Stripe subscription update supports at most 20 items per request; a subscription requiring more than 20 rate-group actions needs explicit batching design before production use.
- The first real test-mode run must confirm the account supports the explicitly configured currency.
- Provider success does not complete local activation until canonical webhook evidence reconciles exact subscription items and billing periods.
