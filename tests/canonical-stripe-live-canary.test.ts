import assert from "node:assert/strict";
import { test } from "node:test";

import Stripe from "stripe";

import type { CanonicalStripeOperationProposal } from "../lib/domain/canonical-stripe-execution";
import {
  asCanonicalStripeLiveCanaryProposal,
  assertCanonicalStripeLiveCanaryAuthorization,
  assertCanonicalStripeLiveCanaryEnvironment,
  canonicalStripeLiveCanaryProposalDigest,
  CanonicalStripeLiveCanaryError,
  LIVE_CANARY_PROVIDER_CONTEXT,
  signCanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "../lib/domain/canonical-stripe-live-canary";
import {
  StripeLiveCanaryCanonicalProviderAdapter,
  type CanonicalStripeLiveCanaryProviderConfig,
} from "../lib/stripe/canonical-live-canary-provider";

const environment: CanonicalStripeLiveCanaryEnvironment = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  CANONICAL_STRIPE_LIVE_CANARY_ENABLED: "true",
  CANONICAL_STRIPE_LIVE_CANARY_CUSTOMER_ID: "customer_canary",
  CANONICAL_STRIPE_LIVE_CANARY_SUBSCRIPTION_ID: "subscription_canary",
  CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID: "acct_expected",
  CANONICAL_STRIPE_LIVE_CANARY_OWNER_EMAIL: "owner@example.com",
  CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET: "synthetic-approval-secret-at-least-32-bytes",
  STRIPE_SECRET_KEY: "sk_live_synthetic_never_sent",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic_never_sent",
};

function proposal(overrides: Partial<CanonicalStripeOperationProposal> = {}): CanonicalStripeOperationProposal {
  return asCanonicalStripeLiveCanaryProposal({
    kind: "activation",
    subscriptionId: "subscription_canary",
    customerId: "customer_canary",
    externalSubscriptionId: null,
    sourceFingerprint: "source",
    providerStateFingerprint: null,
    requestFingerprint: "request",
    operationKey: "replaced",
    confirmationToken: "replaced",
    expectedRecurringTotal: "5.00",
    billingAnchorDate: new Date("2026-11-01T00:00:00.000Z"),
    nextBillingDate: new Date("2026-11-01T00:00:00.000Z"),
    currency: "XCD",
    billingIntervalMonths: 1,
    actions: [{
      kind: "create_rate_group",
      fingerprint: "XCD:1:5.00",
      externalSubscriptionItemId: null,
      externalPriceId: null,
      fromQuantity: null,
      toQuantity: 1,
      agreedAmountPerCycle: "5.00",
      subscriptionItemIds: ["item_canary"],
    }],
    rateGroups: [{
      fingerprint: "XCD:1:5.00",
      currency: "XCD",
      billingIntervalMonths: 1,
      agreedAmountPerCycle: "5.00",
      quantity: 1,
      recurringTotal: "5.00",
      items: [{
        subscriptionItemId: "item_canary",
        subscriptionItemRateId: "rate_canary",
        serviceLabel: "Approved live tracking service",
        classification: "negotiated",
      }],
    }],
    ...overrides,
  });
}

function authorization(
  overrides: Partial<Omit<CanonicalStripeLiveCanaryAuthorization, "signature">> = {},
  proposalInput = proposal(),
): CanonicalStripeLiveCanaryAuthorization {
  const unsigned: Omit<CanonicalStripeLiveCanaryAuthorization, "signature"> = {
    authorizationId: "authorization_canary",
    operation: "activate_subscription",
    operationKey: proposalInput.operationKey,
    requestFingerprint: proposalInput.requestFingerprint,
    sourceFingerprint: proposalInput.sourceFingerprint,
    proposalDigest: canonicalStripeLiveCanaryProposalDigest(proposalInput),
    providerContext: LIVE_CANARY_PROVIDER_CONTEXT,
    providerAccountId: "acct_expected",
    externalSubscriptionId: null,
    approvedByEmail: "owner@example.com",
    customerId: proposalInput.customerId,
    subscriptionId: proposalInput.subscriptionId,
    currency: proposalInput.currency,
    recurringAmount: proposalInput.expectedRecurringTotal,
    taxAmount: "0.00",
    totalExpectedCharge: proposalInput.expectedRecurringTotal,
    billingIntervalMonths: proposalInput.billingIntervalMonths,
    renewalDate: proposalInput.nextBillingDate.toISOString().slice(0, 10),
    cancellationProcedure: "cancel_at_period_end_and_verify",
    customerIdentityConfirmed: true,
    subscriptionConfirmed: true,
    chargeConfirmed: true,
    minimumChargeConfirmed: true,
    renewalConfirmed: true,
    cancellationConfirmed: true,
    issuedAt: "2026-10-16T12:00:00.000Z",
    expiresAt: "2026-10-17T11:59:00.000Z",
    ...overrides,
  };
  return { ...unsigned, signature: signCanonicalStripeLiveCanaryAuthorization(unsigned, environment) };
}

/** Provider-adapter tests use the real clock, so their synthetic approval must stay current. */
function currentAuthorization(
  overrides: Partial<Omit<CanonicalStripeLiveCanaryAuthorization, "signature">> = {},
  proposalInput = proposal(),
): CanonicalStripeLiveCanaryAuthorization {
  const now = Date.now();
  return authorization({
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + (60 * 60 * 1000)).toISOString(),
    ...overrides,
  }, proposalInput);
}

test("live canary requires production, an exact live account and a separate approval secret", () => {
  assert.doesNotThrow(() => assertCanonicalStripeLiveCanaryEnvironment(environment));
  for (const invalid of [
    { ...environment, VERCEL_ENV: "preview" },
    { ...environment, CANONICAL_STRIPE_LIVE_CANARY_ENABLED: undefined },
    { ...environment, STRIPE_SECRET_KEY: "sk_test_forbidden" },
    { ...environment, CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID: "" },
    { ...environment, CANONICAL_STRIPE_LIVE_CANARY_APPROVAL_SECRET: "too-short" },
  ]) {
    assert.throws(
      () => assertCanonicalStripeLiveCanaryEnvironment(invalid),
      (caught: unknown) => caught instanceof CanonicalStripeLiveCanaryError,
    );
  }
});

test("signed authorization binds the one customer, one subscription and every owner confirmation", () => {
  const approvedProposal = proposal();
  const approved = authorization({}, approvedProposal);
  assert.doesNotThrow(() => assertCanonicalStripeLiveCanaryAuthorization({
    proposal: approvedProposal,
    authorization: approved,
    environment,
    now: new Date("2026-10-16T13:00:00.000Z"),
  }));
  for (const changed of [
    proposal({ customerId: "another_customer" }),
    proposal({ subscriptionId: "another_subscription" }),
  ]) {
    assert.throws(
      () => assertCanonicalStripeLiveCanaryAuthorization({ proposal: changed, authorization: approved, environment, now: new Date("2026-10-16T13:00:00.000Z") }),
      (caught: unknown) => caught instanceof CanonicalStripeLiveCanaryError,
    );
  }
});

test("amount, currency, tax, cadence, renewal and signature changes fail closed", () => {
  const base = proposal();
  const cases: Array<[CanonicalStripeOperationProposal, Partial<Omit<CanonicalStripeLiveCanaryAuthorization, "signature">>]> = [
    [proposal({ expectedRecurringTotal: "5.01" }), { recurringAmount: "5.01", totalExpectedCharge: "5.01" }],
    [proposal({ currency: "USD" }), { currency: "USD" }],
    [base, { taxAmount: "0.50", totalExpectedCharge: "5.50" }],
    [proposal({ billingIntervalMonths: 3 }), { billingIntervalMonths: 3 }],
    [base, { renewalDate: "2026-12-01" }],
    [base, { cancellationConfirmed: false }],
    [base, { minimumChargeConfirmed: false }],
  ];
  for (const [candidate, authOverrides] of cases) {
    const signed = authorization(authOverrides, candidate);
    assert.throws(
      () => assertCanonicalStripeLiveCanaryAuthorization({ proposal: candidate, authorization: signed, environment, now: new Date("2026-10-16T13:00:00.000Z") }),
      (caught: unknown) => caught instanceof CanonicalStripeLiveCanaryError,
    );
  }
  const tampered = { ...authorization(), totalExpectedCharge: "4.99" };
  assert.throws(
    () => assertCanonicalStripeLiveCanaryAuthorization({ proposal: base, authorization: tampered, environment, now: new Date("2026-10-16T13:00:00.000Z") }),
    /does not match the approved pilot details/,
  );
});

test("expired authorization and provider synchronization are rejected", () => {
  const approved = authorization();
  assert.throws(
    () => assertCanonicalStripeLiveCanaryAuthorization({ proposal: proposal(), authorization: approved, environment, now: new Date("2026-10-18T00:00:00.000Z") }),
    /current owner authorization/,
  );
  const synchronization = proposal({ kind: "synchronization", externalSubscriptionId: "sub_live" });
  const syncAuthorization = authorization({}, synchronization);
  assert.throws(
    () => assertCanonicalStripeLiveCanaryAuthorization({ proposal: synchronization, authorization: syncAuthorization, environment, now: new Date("2026-10-16T13:00:00.000Z") }),
    /activation only/,
  );
});

class FakeLiveStripe {
  accountId = "acct_expected";
  accountChecks = 0;
  checkoutCreates: Array<{ params: Stripe.Checkout.SessionCreateParams; options?: Stripe.RequestOptions }> = [];
  priceCreates: Stripe.PriceCreateParams[] = [];
  subscriptionUpdates: Array<{ id: string; params: Stripe.SubscriptionUpdateParams; options?: Stripe.RequestOptions }> = [];
  sessions: Stripe.Checkout.Session[] = [];
  prices: Stripe.Price[] = [];
  subscriptions = new Map<string, Stripe.Subscription>();
  checkoutByIdempotencyKey = new Map<string, Stripe.Checkout.Session>();
  customerByIdempotencyKey = new Map<string, Stripe.Customer>();
  customerCreates = 0;
  checkoutExpirations = 0;

  accounts = {
    retrieve: async () => {
      this.accountChecks += 1;
      return { id: this.accountId, charges_enabled: true } as Stripe.Account;
    },
  };

  customers = {
    search: async () => ({ data: [], has_more: false, object: "search_result", url: "/v1/customers/search" }),
    create: async (params: Stripe.CustomerCreateParams, options?: Stripe.RequestOptions) => {
      const key = options?.idempotencyKey;
      if (key && this.customerByIdempotencyKey.has(key)) return this.customerByIdempotencyKey.get(key)!;
      this.customerCreates += 1;
      const customer = {
        id: "cus_live_canary",
        object: "customer",
        livemode: true,
        deleted: false,
        metadata: params.metadata ?? {},
      } as unknown as Stripe.Customer;
      if (key) this.customerByIdempotencyKey.set(key, customer);
      return customer;
    },
  };

  pricesApi = {
    list: async () => ({ data: this.prices, has_more: false, object: "list", url: "/v1/prices" }),
    create: async (params: Stripe.PriceCreateParams) => {
      this.priceCreates.push(params);
      const price = {
        id: `price_live_${this.priceCreates.length}`,
        object: "price",
        livemode: true,
        active: true,
        type: "recurring",
        currency: params.currency,
        unit_amount: params.unit_amount,
        unit_amount_decimal: String(params.unit_amount),
        recurring: params.recurring,
        lookup_key: params.lookup_key,
        metadata: params.metadata ?? {},
      } as unknown as Stripe.Price;
      this.prices.push(price);
      return price;
    },
  };

  checkout = {
    sessions: {
      list: async () => ({ data: this.sessions, has_more: false, object: "list", url: "/v1/checkout/sessions" }),
      retrieve: async (id: string) => this.sessions.find((session) => session.id === id)!,
      create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
        const key = options?.idempotencyKey;
        if (key && this.checkoutByIdempotencyKey.has(key)) return this.checkoutByIdempotencyKey.get(key)!;
        this.checkoutCreates.push({ params, options });
        const session = {
          id: "cs_live_canary",
          object: "checkout.session",
          livemode: true,
          mode: "subscription",
          status: "open",
          url: "https://checkout.stripe.com/live-canary",
          metadata: params.metadata,
          subscription: null,
        } as unknown as Stripe.Checkout.Session;
        this.sessions = [session];
        if (key) this.checkoutByIdempotencyKey.set(key, session);
        return session;
      },
      expire: async (id: string) => {
        this.checkoutExpirations += 1;
        return { ...this.sessions.find((session) => session.id === id)!, status: "expired", url: null };
      },
    },
  };

  subscriptionsApi = {
    retrieve: async (id: string) => this.subscriptions.get(id)!,
    update: async (id: string, params: Stripe.SubscriptionUpdateParams, options?: Stripe.RequestOptions) => {
      this.subscriptionUpdates.push({ id, params, options });
      const current = this.subscriptions.get(id)!;
      const updated = {
        ...current,
        cancel_at_period_end: params.cancel_at_period_end ?? current.cancel_at_period_end,
        metadata: params.metadata ?? current.metadata,
      } as Stripe.Subscription;
      this.subscriptions.set(id, updated);
      return updated;
    },
  };

  client(): Stripe {
    return {
      accounts: this.accounts,
      customers: this.customers,
      prices: this.pricesApi,
      checkout: this.checkout,
      subscriptions: this.subscriptionsApi,
    } as unknown as Stripe;
  }
}

const providerConfig: CanonicalStripeLiveCanaryProviderConfig = {
  expectedAccountId: "acct_expected",
  authorizationId: "authorization_canary",
  authorization: currentAuthorization(),
  proposal: proposal(),
  environment,
  successUrl: "https://tlportal.example/pay/thanks?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://tlportal.example/pay/cancel",
  currency: "XCD",
  minorUnitExponent: 2,
};

test("live adapter verifies account and creates an exact EC$5 monthly Checkout without proration", async () => {
  const fake = new FakeLiveStripe();
  const adapter = new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), providerConfig);
  const idempotencyKey = `tl-canonical-activation:${proposal().operationKey}`;
  const result = await adapter.createActivationCheckout(proposal(), idempotencyKey);
  assert.equal(result.id, "cs_live_canary");
  assert.equal(fake.accountChecks, 1);
  assert.equal(fake.priceCreates[0].currency, "xcd");
  assert.equal(fake.priceCreates[0].unit_amount, 500);
  assert.deepEqual(fake.priceCreates[0].recurring, { interval: "month", interval_count: 1, usage_type: "licensed" });
  assert.equal(fake.checkoutCreates[0].options?.idempotencyKey, idempotencyKey);
  assert.equal(fake.checkoutCreates[0].params.subscription_data?.proration_behavior, "none");
  assert.equal(fake.checkoutCreates[0].params.subscription_data?.billing_cycle_anchor, Date.parse("2026-11-01T00:00:00.000Z") / 1000);
  assert.equal(fake.checkoutCreates[0].params.metadata?.tl_provider_mode, "live_canary");
  assert.equal(fake.checkoutCreates[0].params.metadata?.tl_canary_authorization_id, "authorization_canary");
});

test("wrong Stripe account and non-live provider objects are rejected before acceptance", async () => {
  const wrongAccount = new FakeLiveStripe();
  wrongAccount.accountId = "acct_wrong";
  await assert.rejects(
    new StripeLiveCanaryCanonicalProviderAdapter(wrongAccount.client(), providerConfig)
      .createActivationCheckout(proposal(), `tl-canonical-activation:${proposal().operationKey}`),
    /different account/,
  );
  const fake = new FakeLiveStripe();
  fake.sessions = [{
    id: "cs_wrong_mode",
    livemode: false,
    status: "open",
    metadata: {
      tl_canonical_operation_key: proposal().operationKey,
      tl_canonical_subscription_id: "subscription_canary",
      tl_provider_mode: "live_canary",
      tl_canary_authorization_id: "authorization_canary",
    },
  } as unknown as Stripe.Checkout.Session];
  await assert.rejects(
    new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), providerConfig)
      .retrieveCheckoutSession("cs_wrong_mode", proposal().operationKey, "subscription_canary"),
    /live-mode Stripe object/,
  );
});

test("provider ownership and authorization metadata are exact", async () => {
  const fake = new FakeLiveStripe();
  fake.sessions = [{
    id: "cs_wrong_owner",
    livemode: true,
    status: "open",
    metadata: {
      tl_canonical_operation_key: proposal().operationKey,
      tl_canonical_subscription_id: "subscription_canary",
      tl_provider_mode: "live_canary",
      tl_canary_authorization_id: "another_authorization",
    },
  } as unknown as Stripe.Checkout.Session];
  await assert.rejects(
    new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), providerConfig)
      .retrieveCheckoutSession("cs_wrong_owner", proposal().operationKey, "subscription_canary"),
    /not owned by the approved live canary/,
  );
});

test("direct adapter mutations require an untampered, current and exactly matched owner approval", async () => {
  const approvedProposal = proposal();
  const key = `tl-canonical-activation:${approvedProposal.operationKey}`;
  const valid = authorization({}, approvedProposal);
  const expired = authorization({
    issuedAt: "2020-01-01T00:00:00.000Z",
    expiresAt: "2020-01-01T01:00:00.000Z",
  }, approvedProposal);
  const tampered = { ...valid, totalExpectedCharge: "4.99" };
  const alternateProposal = proposal({
    requestFingerprint: "another_request",
    sourceFingerprint: "another_source",
  });
  const mismatched = authorization({}, alternateProposal);
  const unsigned = { ...valid, signature: "" };

  for (const candidate of [unsigned, expired, tampered, mismatched]) {
    const fake = new FakeLiveStripe();
    const adapter = new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), {
      ...providerConfig,
      authorization: candidate,
    });
    await assert.rejects(adapter.createActivationCheckout(approvedProposal, key));
    assert.equal(fake.accountChecks, 0);
    assert.equal(fake.customerCreates, 0);
    assert.equal(fake.priceCreates.length, 0);
    assert.equal(fake.checkoutCreates.length, 0);
  }

  const changedTerms = proposal({
    actions: [{ ...approvedProposal.actions[0], subscriptionItemIds: ["different_item"] }],
  });
  const fake = new FakeLiveStripe();
  await assert.rejects(
    new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), providerConfig)
      .createActivationCheckout(changedTerms, key),
    /exactly match the signed canonical operation/,
  );
  assert.equal(fake.accountChecks, 0);
  assert.equal(fake.checkoutCreates.length, 0);
});

test("adapter replay is constrained to the approved idempotency key and cannot duplicate provider mutations", async () => {
  const approvedProposal = proposal();
  const key = `tl-canonical-activation:${approvedProposal.operationKey}`;
  const fake = new FakeLiveStripe();
  const adapter = new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), providerConfig);
  const [first, replay] = await Promise.all([
    adapter.createActivationCheckout(approvedProposal, key),
    adapter.createActivationCheckout(approvedProposal, key),
  ]);
  assert.equal(first.id, replay.id);
  assert.equal(fake.customerCreates, 1);
  assert.equal(fake.priceCreates.length, 1);
  assert.equal(fake.checkoutCreates.length, 1);

  await assert.rejects(
    adapter.createActivationCheckout(approvedProposal, `${key}:attacker-controlled`),
    /idempotency key is not bound/,
  );
  assert.equal(fake.checkoutCreates.length, 1);
});

test("unapproved Checkout expiry and mismatched cancellation cannot mutate provider state", async () => {
  const fake = new FakeLiveStripe();
  const activationAdapter = new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), providerConfig);
  await assert.rejects(
    activationAdapter.expireCheckoutSession("cs_live_canary", "arbitrary"),
    /not an owner-authorized live-canary operation/,
  );
  await assert.rejects(
    activationAdapter.scheduleCancellationAtPeriodEnd({
      externalSubscriptionId: "sub_live",
      canonicalSubscriptionId: "subscription_canary",
      idempotencyKey: "arbitrary",
    }),
    /does not permit this provider mutation/,
  );
  assert.equal(fake.checkoutExpirations, 0);
  assert.equal(fake.subscriptionUpdates.length, 0);
  assert.equal(fake.accountChecks, 0);
});

test("expired mutation approval does not disable independently guarded read-only reconciliation", async () => {
  const fake = new FakeLiveStripe();
  const approvedProposal = proposal();
  fake.sessions = [{
    id: "cs_read_only",
    object: "checkout.session",
    livemode: true,
    status: "open",
    metadata: {
      tl_canonical_operation_key: approvedProposal.operationKey,
      tl_canonical_subscription_id: approvedProposal.subscriptionId,
      tl_provider_mode: "live_canary",
      tl_canary_authorization_id: "authorization_canary",
    },
  } as unknown as Stripe.Checkout.Session];
  const expired = authorization({
    issuedAt: "2020-01-01T00:00:00.000Z",
    expiresAt: "2020-01-01T01:00:00.000Z",
  }, approvedProposal);
  const adapter = new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), {
    ...providerConfig,
    authorization: expired,
  });
  const result = await adapter.retrieveCheckoutSession(
    "cs_read_only",
    approvedProposal.operationKey,
    approvedProposal.subscriptionId,
  );
  assert.equal(result.id, "cs_read_only");
  assert.equal(fake.accountChecks, 1);
});

test("cancellation is end-of-period, idempotent and preserves the billing anchor", async () => {
  const fake = new FakeLiveStripe();
  fake.subscriptions.set("sub_live", {
    id: "sub_live",
    object: "subscription",
    livemode: true,
    status: "active",
    billing_cycle_anchor: Date.parse("2026-11-01T00:00:00.000Z") / 1000,
    current_period_end: Date.parse("2026-11-01T00:00:00.000Z") / 1000,
    cancel_at_period_end: false,
    metadata: {
      tl_canonical_subscription_id: "subscription_canary",
      tl_provider_mode: "live_canary",
      tl_canary_authorization_id: "authorization_canary",
    },
  } as unknown as Stripe.Subscription);
  const cancellationAuthorization = currentAuthorization({
    operation: "cancel_subscription_at_period_end",
    externalSubscriptionId: "sub_live",
  });
  const cancellationConfig: CanonicalStripeLiveCanaryProviderConfig = {
    ...providerConfig,
    authorization: cancellationAuthorization,
    authorizationId: cancellationAuthorization.authorizationId,
  };
  const adapter = new StripeLiveCanaryCanonicalProviderAdapter(fake.client(), cancellationConfig);
  const idempotencyKey = `tl-canonical-live-canary-cancel:${cancellationAuthorization.authorizationId}`;
  await assert.rejects(
    adapter.scheduleCancellationAtPeriodEnd({
      externalSubscriptionId: "sub_live",
      canonicalSubscriptionId: "subscription_canary",
      idempotencyKey: `${idempotencyKey}:mismatched`,
    }),
    /Cancellation idempotency is not bound/,
  );
  assert.equal(fake.subscriptionUpdates.length, 0);
  const result = await adapter.scheduleCancellationAtPeriodEnd({
    externalSubscriptionId: "sub_live",
    canonicalSubscriptionId: "subscription_canary",
    idempotencyKey,
  });
  assert.equal(result.cancelAtPeriodEnd, true);
  assert.equal(fake.subscriptionUpdates[0].params.cancel_at_period_end, true);
  assert.equal(fake.subscriptionUpdates[0].params.proration_behavior, "none");
  assert.equal(fake.subscriptionUpdates[0].options?.idempotencyKey, idempotencyKey);
});
