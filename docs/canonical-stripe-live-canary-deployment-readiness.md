# Canonical Stripe live canary deployment readiness

This document covers the Phase 3B3C release candidate. It authorizes neither a production deployment nor a Stripe operation. The release is designed to be deployed with canonical provider execution disabled while legacy billing remains authoritative.

## Release contents

Relative to production `main` at `5e329ad`, the release contains only the validated Phase 3B3A test-provider integration and Phase 3B3B live-canary preparation. It adds no Prisma migration and does not change cron configuration, legacy Checkout routes, or canonical production UI routes.

The production build may continue to run `prisma migrate deploy`; this release has no migrations beyond the 61 already validated with the release history. Preview builds continue to skip migrations, and `validation/postgres-foundation` remains excluded from Vercel deployments.

## Disabled production configuration

For the first disabled deployment, retain the existing production values for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_ENABLED`, database variables, cron secret, and `CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE`.

The following canonical execution variables must be absent, or not equal to `true`:

- `CANONICAL_STRIPE_LIVE_CANARY_ENABLED`
- `CANONICAL_STRIPE_EXECUTION_ENABLED`
- `CANONICAL_STRIPE_TEST_PROVIDER_ENABLED`
- `CANONICAL_NATIVE_BILLING_ENABLED`
- `CANONICAL_ANNUAL_ADJUSTMENTS_ENABLED`
- `ALLOW_CANONICAL_MIGRATION_EXECUTION`
- `CANONICAL_SUBSCRIPTION_UI_ENABLED`

The following live-canary values are unnecessary for the disabled deployment and should remain absent:

- `CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID`
- `CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID`
- `CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID`
- `CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL`
- `CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET`

Do not configure any `CANONICAL_STRIPE_TEST_*` value in Vercel Production. `CANONICAL_SUBSCRIPTION_UI_PRODUCTION_VISIBLE=true` controls authenticated read-only canonical pages only; it does not satisfy any billing execution guard.

## Server-side safety result

With the live-canary variables absent:

- The live adapter cannot initialize because production context, the exact enable flag, customer, subscription, account, owner, approval secret, live Stripe key, and webhook secret are all required.
- No application route, server action, UI control, cron, or webhook creates a live-canary authorization or calls live-canary approval, activation, synchronization, or cancellation services.
- General canonical Stripe execution rejects production even if its feature flag is set.
- The Stripe test provider rejects production and rejects live Stripe credentials.
- Canonical native recurring billing and annual adjustment invoicing reject production even if their flags are set.
- Canonical migration execution rejects production, Vercel, remote databases, and non-local database names.
- The canonical production UI remains read-only. Its write actions independently reject production.
- Existing legacy Stripe Checkout, native invoice payment, subscription synchronization, invoice/payment handling, and recurring cron paths remain unchanged.

The production Stripe webhook still verifies `STRIPE_WEBHOOK_SECRET` before dispatch. The live-canary discriminator runs before general canonical and legacy fulfillment so canary-owned events cannot spill into legacy processing. Events without exact canary evidence continue to the existing legacy handler.

## Signed authorization and secret handling

Every permitted mutation validates the owner signature inside the provider adapter. The signature covers the exact operation, canonical customer and subscription, full proposal digest, operation and source fingerprints, provider account and mode, amount, currency, tax, cadence, renewal date, expiration, and any exact provider subscription used for cancellation.

Activation accepts only operation-derived idempotency keys. Exact retries reuse the same provider operation; caller-chosen keys are rejected. Provider synchronization and Checkout expiry are not authorized by the live-canary adapter. Cancellation requires a separate current signature for `cancel_subscription_at_period_end`, the exact Stripe subscription ID, and the operator confirmation phrase.

For a future separately authorized pilot:

1. Generate at least 32 random bytes with a trusted password-manager generator or operating-system cryptographic generator.
2. Store the value only as the encrypted Vercel Production variable `CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET`, with a recovery copy in the owner's password manager.
3. Never pass the secret as a command-line argument, paste it into chat, commit it, include it in an approval package, or emit it to logs.
4. Produce the immutable canonical operation proposal inside an authorized server-side operator context.
5. Sign the proposal server-side with `signCanonicalStripeLiveCanaryAuthorization` and immediately verify it with `assertCanonicalStripeLiveCanaryAuthorization` before durable approval.
6. Export only the proposal, signed authorization, validity timestamps, and confirmation checklist for owner review. The secret never leaves the process environment.

This disabled release deliberately exposes no production route or ordinary admin control for steps 4–6. A narrowly scoped, owner-authorized invocation method must be reviewed separately before a live pilot. Environment variables alone cannot invoke the adapter.

## Existing Stripe compatibility checklist

The existing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` namespaces are reused. A standard live secret key is sufficient in principle. If the existing credential is a restricted `rk_live_` key, the owner must verify read/write access for Account retrieval, Customer search/create, Price list/create, Checkout Session list/retrieve/create, Subscription retrieve/update, Invoice list/retrieve, and PaymentIntent retrieve.

In Stripe Dashboard, the owner must inspect the existing endpoint for `/api/webhooks/stripe` and confirm delivery of:

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

No Dashboard change is part of this release. XCD is supported by Stripe generally, but the production account's XCD payment-method support, settlement path, tax configuration, and account-specific minimum charge for EC$5 require owner verification.

## Future pilot procedure

1. Obtain explicit consent from one genuine customer.
2. Confirm that exactly one eligible canonical, Stripe-autocharge subscription exists for that customer. Legacy or shadow records are ineligible.
3. Verify its item quantities, monthly XCD total of no more than EC$5, zero approved tax, renewal anchor, and no competing provider relationship.
4. Verify the production Stripe account ID, key permissions, XCD support, minimum charge, webhook events, tax behavior, and cancellation plan.
5. Create a fresh operation-specific authorization with a validity window no longer than 24 hours and independently verify its signature and proposal digest.
6. Create one durable approved `BillingOperation`, then execute one activation through the separately reviewed owner-only invocation method.
7. Complete the one Checkout Session and monitor its operation key, Stripe subscription, initial invoice/payment, webhook delivery, provider link, immutable attribution, and local collection state.
8. On timeout or failure, recover by operation key and the fixed idempotency key. Never create an ad-hoc replacement Checkout or rerun with a different key.
9. If cancellation is required, create a new signed cancellation authorization for the exact Stripe subscription and schedule cancellation at period end.
10. Confirm the final provider status, cancellation webhook, local reconciliation, next-renewal state, and absence of any later unintended invoice.

No customer is currently selected, no authorization should be generated during deployment readiness, and no genuine pilot may begin without separate owner approval.

## Future deployment sequence

1. Verify the production branch, database targets, direct migration connection, and that no competing production build is active.
2. Create a current Neon recovery checkpoint.
3. Confirm the release commit and successful disposable PostgreSQL validation.
4. Confirm all canonical execution and live-canary variables listed above are absent.
5. Merge and deploy once, allowing the normal production migration check; no new migration is expected.
6. Smoke-test the admin dashboard, customer/subscription pages, legacy Stripe Checkout, native invoice payment, webhook health, and daily recurring cron configuration without creating transactions.
7. Verify the authenticated canonical overview/detail/demo remain read-only.
8. Confirm no live-canary `BillingOperation`, provider relationship, Checkout Session, Stripe subscription, invoice, or payment was created.
9. Report the deployed commit and remain in disabled observation until a separate canary authorization is approved.

## Readiness decision

- Disabled production deployment: **GO after owner-authorized merge and the deployment preflight above.**
- Genuine live canary: **NO-GO** until one eligible canonical subscription exists, account-specific Stripe checks pass, the owner-only proposal/sign/execute method is separately reviewed, and the owner issues a fresh operation-specific authorization.
