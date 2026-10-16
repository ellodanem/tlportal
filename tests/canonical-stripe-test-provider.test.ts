import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma } from "@prisma/client";
import Stripe from "stripe";

import {
  assertCanonicalStripeTestProviderEnabled,
  buildCanonicalStripeOperationProposal,
  type CanonicalStripeOperationProposal,
} from "../lib/domain/canonical-stripe-execution";
import {
  buildCanonicalStripeRateGroups,
  type CanonicalStripeConfigurationInput,
  type LocalStripeProviderLink,
  type ObservedStripeSubscription,
} from "../lib/domain/canonical-stripe-shadow";
import {
  canonicalMajorAmountToStripeMinor,
  canonicalStripeTestProviderConfig,
  CanonicalStripeTestProviderError,
  constructCanonicalStripeTestWebhookEvent,
  reconcileCanonicalStripeTestProviderResult,
  StripeTestCanonicalProviderAdapter,
  type CanonicalStripeTestProviderConfig,
  type CanonicalStripeTestProviderEnvironment,
} from "../lib/stripe/canonical-test-provider";

const providerConfig: CanonicalStripeTestProviderConfig = {
  successUrl: "http://localhost:3000/pay/thanks?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "http://localhost:3000/pay/cancel",
  currency: "XCD",
  minorUnitExponent: 2,
};

const providerEnvironment: CanonicalStripeTestProviderEnvironment = {
  NODE_ENV: "test",
  CANONICAL_STRIPE_EXECUTION_ENABLED: "true",
  CANONICAL_STRIPE_TEST_PROVIDER_ENABLED: "true",
  CANONICAL_STRIPE_TEST_SECRET_KEY: "sk_test_synthetic_only",
  CANONICAL_STRIPE_TEST_WEBHOOK_SECRET: "whsec_synthetic_only",
  CANONICAL_STRIPE_TEST_SUCCESS_URL: providerConfig.successUrl,
  CANONICAL_STRIPE_TEST_CANCEL_URL: providerConfig.cancelUrl,
  CANONICAL_STRIPE_TEST_CURRENCY: "XCD",
  CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT: "2",
};

function configuration(input: {
  id?: string;
  interval?: 1 | 3 | 6 | 12;
  lifecycle?: "pending_activation" | "active";
  amounts?: { id: string; amount: string; classification?: "standard" | "negotiated" }[];
} = {}): CanonicalStripeConfigurationInput {
  const interval = input.interval ?? 1;
  const nextBillingDate = interval === 12 ? "2099-01-01" : "2098-11-01";
  return {
    id: input.id ?? "subscription-test-1",
    customerId: "customer-test-1",
    controlMode: "canonical",
    collectionMethod: "stripe_autocharge",
    lifecycleStatus: input.lifecycle ?? "pending_activation",
    billingIntervalMonths: interval,
    currency: "XCD",
    billingAnchorDate: new Date("2098-01-01T00:00:00.000Z"),
    nextBillingDate: new Date(`${nextBillingDate}T00:00:00.000Z`),
    items: (input.amounts ?? [
      { id: "standard-a", amount: "25.00" },
      { id: "standard-b", amount: "25.00" },
      { id: "negotiated", amount: "20.00", classification: "negotiated" },
    ]).map((entry) => ({
      id: entry.id,
      label: entry.id,
      status: input.lifecycle === "active" ? "active" : "pending_activation",
      billingEffectiveFrom: new Date("2098-01-01T00:00:00.000Z"),
      billingEffectiveUntil: null,
      rates: [{
        id: `rate-${entry.id}`,
        billingIntervalMonths: interval,
        agreedAmountPerCycle: new Prisma.Decimal(entry.amount),
        currency: "XCD",
        effectiveFrom: new Date("2098-01-01T00:00:00.000Z"),
        effectiveUntil: null,
        classification: entry.classification ?? "standard",
      }],
    })),
  };
}

function activationProposal(input: Parameters<typeof configuration>[0] = {}): CanonicalStripeOperationProposal {
  return buildCanonicalStripeOperationProposal({
    kind: "activation",
    configuration: configuration(input),
    providerLink: null,
    observed: null,
  });
}

function price(input: {
  id: string;
  fingerprint: string;
  amount: string;
  intervalMonths: number;
  livemode?: boolean;
}): Stripe.Price {
  const annual = input.intervalMonths === 12;
  return {
    id: input.id,
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created: 1,
    currency: "xcd",
    custom_unit_amount: null,
    livemode: input.livemode ?? false,
    lookup_key: null,
    metadata: { tl_rate_group_fingerprint: input.fingerprint },
    nickname: null,
    product: "prod_test",
    recurring: {
      interval: annual ? "year" : "month",
      interval_count: annual ? 1 : input.intervalMonths,
      usage_type: "licensed",
      aggregate_usage: null,
      meter: null,
      trial_period_days: null,
    },
    tax_behavior: "unspecified",
    tiers_mode: null,
    transform_quantity: null,
    type: "recurring",
    unit_amount: canonicalMajorAmountToStripeMinor(input.amount, 2),
    unit_amount_decimal: String(canonicalMajorAmountToStripeMinor(input.amount, 2)),
  } as Stripe.Price;
}

function subscription(input: {
  id?: string;
  canonicalSubscriptionId: string;
  items: { id: string; price: Stripe.Price; quantity: number }[];
  nextBillingDate: Date;
  intervalMonths: number;
  livemode?: boolean;
  lastOperationKey?: string;
}): Stripe.Subscription {
  const periodStart = new Date(input.nextBillingDate);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - input.intervalMonths);
  return {
    id: input.id ?? "sub_test_1",
    object: "subscription",
    billing_cycle_anchor: Math.floor(periodStart.getTime() / 1000),
    cancel_at_period_end: false,
    current_period_start: Math.floor(periodStart.getTime() / 1000),
    current_period_end: Math.floor(input.nextBillingDate.getTime() / 1000),
    customer: "cus_test_1",
    items: {
      object: "list",
      data: input.items.map((item) => ({
        id: item.id,
        object: "subscription_item",
        billing_thresholds: null,
        created: 1,
        discounts: [],
        metadata: { tl_rate_group_fingerprint: item.price.metadata.tl_rate_group_fingerprint },
        plan: item.price as unknown as Stripe.Plan,
        price: item.price,
        quantity: item.quantity,
        subscription: input.id ?? "sub_test_1",
        tax_rates: [],
      }) as unknown as Stripe.SubscriptionItem),
      has_more: false,
      url: "/v1/subscription_items",
    },
    latest_invoice: null,
    livemode: input.livemode ?? false,
    metadata: {
      tl_canonical_subscription_id: input.canonicalSubscriptionId,
      ...(input.lastOperationKey ? { tl_canonical_last_operation_key: input.lastOperationKey } : {}),
    },
    status: "active",
  } as unknown as Stripe.Subscription;
}

class FakeStripeApi {
  customersData: Stripe.Customer[] = [];
  pricesData: Stripe.Price[] = [];
  sessionsData: Stripe.Checkout.Session[] = [];
  subscriptionsData = new Map<string, Stripe.Subscription>();
  checkoutCreates: Stripe.Checkout.SessionCreateParams[] = [];
  checkoutIdempotencyKeys: (string | undefined)[] = [];
  subscriptionUpdates: Stripe.SubscriptionUpdateParams[] = [];
  subscriptionIdempotencyKeys: (string | undefined)[] = [];
  customerCreates = 0;
  priceCreates = 0;
  invoicesData: Stripe.Invoice[] = [];
  paymentIntentsData = new Map<string, Stripe.PaymentIntent>();

  readonly customers = {
    search: async (params: Stripe.CustomerSearchParams) => ({
      object: "search_result" as const,
      data: this.customersData.filter((customer) =>
        params.query.includes(customer.metadata.tl_canonical_customer_id ?? "__none__")),
      has_more: false,
      next_page: null,
      url: "/v1/customers/search",
    }),
    create: async (params: Stripe.CustomerCreateParams) => {
      this.customerCreates += 1;
      const created = {
        id: `cus_test_${this.customerCreates}`,
        object: "customer",
        deleted: false,
        livemode: false,
        metadata: (params.metadata || {}) as Stripe.Metadata,
      } as unknown as Stripe.Customer;
      this.customersData.push(created);
      return created;
    },
  };

  readonly prices = {
    list: async (params: Stripe.PriceListParams) => ({
      object: "list" as const,
      data: this.pricesData.filter((candidate) =>
        !params.lookup_keys?.length || params.lookup_keys.includes(candidate.lookup_key ?? "")),
      has_more: false,
      url: "/v1/prices",
    }),
    create: async (params: Stripe.PriceCreateParams) => {
      this.priceCreates += 1;
      const months = params.recurring?.interval === "year"
        ? (params.recurring.interval_count ?? 1) * 12
        : params.recurring?.interval_count ?? 1;
      const created = price({
        id: `price_test_${this.priceCreates}`,
        fingerprint: String(params.metadata?.tl_rate_group_fingerprint ?? ""),
        amount: new Prisma.Decimal(params.unit_amount ?? 0).dividedBy(100).toFixed(2),
        intervalMonths: months,
      });
      created.lookup_key = params.lookup_key ?? null;
      this.pricesData.push(created);
      return created;
    },
  };

  readonly checkout = {
    sessions: {
      list: async () => ({
        object: "list" as const,
        data: this.sessionsData,
        has_more: false,
        url: "/v1/checkout/sessions",
      }),
      create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
        this.checkoutCreates.push(params);
        this.checkoutIdempotencyKeys.push(options?.idempotencyKey);
        const created = {
          id: `cs_test_${this.checkoutCreates.length}`,
          object: "checkout.session",
          livemode: false,
          metadata: params.metadata ?? {},
          mode: "subscription",
          status: "open",
          subscription: null,
          url: `https://checkout.stripe.test/${this.checkoutCreates.length}`,
        } as Stripe.Checkout.Session;
        this.sessionsData.push(created);
        return created;
      },
      retrieve: async (id: string) => this.sessionsData.find((session) => session.id === id)!,
      expire: async (id: string) => {
        const current = this.sessionsData.find((session) => session.id === id)!;
        const expired = { ...current, status: "expired" as const, url: null };
        this.sessionsData = this.sessionsData.map((session) => session.id === id ? expired : session);
        return expired;
      },
    },
  };

  readonly subscriptions = {
    retrieve: async (id: string) => {
      const found = this.subscriptionsData.get(id);
      if (!found) throw Object.assign(new Error("missing"), { code: "resource_missing" });
      return found;
    },
    update: async (id: string, params: Stripe.SubscriptionUpdateParams, options?: Stripe.RequestOptions) => {
      this.subscriptionUpdates.push(params);
      this.subscriptionIdempotencyKeys.push(options?.idempotencyKey);
      const current = this.subscriptionsData.get(id)!;
      let items = [...current.items.data];
      for (const update of params.items ?? []) {
        if (update.deleted && update.id) {
          items = items.filter((item) => item.id !== update.id);
          continue;
        }
        const providerPrice = update.price
          ? this.pricesData.find((candidate) => candidate.id === update.price)
          : null;
        if (update.id) {
          items = items.map((item) => item.id === update.id
            ? {
              ...item,
              quantity: update.quantity ?? item.quantity,
              price: providerPrice ?? item.price,
              plan: providerPrice ? providerPrice as unknown as Stripe.Plan : item.plan,
              metadata: providerPrice
                ? { tl_rate_group_fingerprint: providerPrice.metadata.tl_rate_group_fingerprint }
                : item.metadata,
            }
            : item);
        } else if (providerPrice) {
          items.push({
            id: `si_test_${items.length + 1}`,
            object: "subscription_item",
            billing_thresholds: null,
            created: 1,
            discounts: [],
            metadata: { tl_rate_group_fingerprint: providerPrice.metadata.tl_rate_group_fingerprint },
            plan: providerPrice as unknown as Stripe.Plan,
            price: providerPrice,
            quantity: update.quantity ?? 1,
            subscription: id,
            tax_rates: [],
          } as unknown as Stripe.SubscriptionItem);
        }
      }
      const updated = {
        ...current,
        metadata: params.metadata as Stripe.Metadata,
        items: { ...current.items, data: items },
      };
      this.subscriptionsData.set(id, updated);
      return updated;
    },
  };

  readonly invoices = {
    list: async () => ({
      object: "list" as const,
      data: this.invoicesData,
      has_more: false,
      url: "/v1/invoices",
    }),
  };

  readonly paymentIntents = {
    retrieve: async (id: string) => this.paymentIntentsData.get(id)!,
  };

  client(): Stripe {
    return this as unknown as Stripe;
  }
}

function activationAdapter(fake = new FakeStripeApi()) {
  return { fake, adapter: new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig) };
}

test("test provider requires both canonical flags, explicit isolated configuration and an sk_test key", () => {
  assert.doesNotThrow(() => assertCanonicalStripeTestProviderEnabled(providerEnvironment));
  assert.equal(canonicalStripeTestProviderConfig(providerEnvironment).currency, "XCD");
  for (const environment of [
    { ...providerEnvironment, CANONICAL_STRIPE_TEST_PROVIDER_ENABLED: undefined },
    { ...providerEnvironment, CANONICAL_STRIPE_TEST_SECRET_KEY: "sk_live_forbidden" },
    { ...providerEnvironment, NODE_ENV: "production" },
    { ...providerEnvironment, VERCEL_ENV: "production" },
  ]) {
    assert.throws(
      () => canonicalStripeTestProviderConfig(environment),
      (caught: unknown) => caught instanceof Error,
    );
  }
});

test("currency conversion is exact and rejects unrepresentable precision", () => {
  assert.equal(canonicalMajorAmountToStripeMinor("25.00", 2), 2500);
  assert.equal(canonicalMajorAmountToStripeMinor("275.00", 2), 27500);
  assert.throws(
    () => canonicalMajorAmountToStripeMinor("20.001", 2),
    (caught: unknown) => caught instanceof CanonicalStripeTestProviderError
      && caught.code === "AMOUNT_PRECISION_INVALID",
  );
});

test("multi-item Checkout preserves standard and negotiated groups at EC$70", async () => {
  const proposal = activationProposal();
  const { fake, adapter } = activationAdapter();
  const session = await adapter.createActivationCheckout(proposal, "idempotency-test");
  assert.equal(session.status, "open");
  assert.equal(fake.priceCreates, 2);
  assert.deepEqual(fake.checkoutCreates[0].line_items?.map((item) => item.quantity), [1, 2]);
  assert.equal(proposal.expectedRecurringTotal, "70.00");
  assert.equal(fake.checkoutCreates[0].subscription_data?.proration_behavior, "none");
  assert.equal(fake.checkoutIdempotencyKeys[0], "idempotency-test");
});

test("quarterly, six-month and annual rates create exact recurring Price terms", async () => {
  for (const interval of [3, 6, 12] as const) {
    const proposal = activationProposal({
      id: `subscription-${interval}`,
      interval,
      amounts: [{ id: `rate-${interval}`, amount: interval === 12 ? "275.00" : "60.00", classification: "negotiated" }],
    });
    const { fake, adapter } = activationAdapter();
    await adapter.createActivationCheckout(proposal, `idempotency-${interval}`);
    const recurring = fake.pricesData[0].recurring!;
    assert.deepEqual(
      [recurring.interval, recurring.interval_count],
      interval === 12 ? ["year", 1] : ["month", interval],
    );
    assert.equal(fake.pricesData[0].unit_amount, interval === 12 ? 27500 : 6000);
  }
});

test("compatible Prices are reused and incompatible fingerprint collisions are rejected", async () => {
  const proposal = activationProposal({ amounts: [{ id: "one", amount: "25.00" }] });
  const { fake, adapter } = activationAdapter();
  await adapter.createActivationCheckout(proposal, "first");
  await adapter.createActivationCheckout(proposal, "second");
  assert.equal(fake.priceCreates, 1);
  fake.pricesData[0].unit_amount = 2600;
  fake.pricesData[0].unit_amount_decimal = "2600";
  await assert.rejects(
    adapter.createActivationCheckout(proposal, "third"),
    (caught: unknown) => caught instanceof CanonicalStripeTestProviderError
      && caught.code === "PRICE_FINGERPRINT_CONFLICT",
  );
});

test("independent subscriptions for one synthetic customer reuse only the Customer", async () => {
  const { fake, adapter } = activationAdapter();
  await adapter.createActivationCheckout(activationProposal({ id: "subscription-a" }), "a");
  await adapter.createActivationCheckout(activationProposal({ id: "subscription-b" }), "b");
  assert.equal(fake.customerCreates, 1);
  assert.equal(fake.checkoutCreates.length, 2);
  assert.notEqual(fake.checkoutCreates[0].metadata?.tl_canonical_subscription_id, fake.checkoutCreates[1].metadata?.tl_canonical_subscription_id);
});

test("Checkout recovery uses exact operation and subscription metadata", async () => {
  const proposal = activationProposal();
  const { adapter } = activationAdapter();
  const created = await adapter.createActivationCheckout(proposal, "recover-create");
  assert.equal(
    (await adapter.retrieveCheckoutSession(created.id, proposal.operationKey, proposal.subscriptionId)).id,
    created.id,
  );
  const recovered = await adapter.recoverActivation(proposal.operationKey, proposal.subscriptionId);
  assert.equal(recovered?.id, created.id);
  assert.equal(await adapter.recoverActivation("another-operation", proposal.subscriptionId), null);
  await assert.rejects(
    adapter.retrieveCheckoutSession(created.id, "another-operation", proposal.subscriptionId),
    (caught: unknown) => caught instanceof CanonicalStripeTestProviderError
      && caught.code === "PROVIDER_OWNERSHIP_MISMATCH",
  );
});

test("synchronization changes quantity without proration or anchor movement", async () => {
  const config = configuration({ lifecycle: "active" });
  const expected = buildCanonicalStripeRateGroups(config, config.nextBillingDate!, { requireActive: false });
  const providerItems = expected.groups.map((group, index) => ({
    id: `mapping-${index}`,
    subscriptionProviderLinkId: "link-test",
    externalSubscriptionItemId: `si-test-${index}`,
    externalPriceId: `price-test-${index}`,
    currency: group.currency,
    billingIntervalMonths: group.billingIntervalMonths,
    agreedAmountPerCycle: group.agreedAmountPerCycle,
    quantity: group.quantity,
    rateGroupFingerprint: group.fingerprint,
  }));
  const link: LocalStripeProviderLink = {
    id: "link-test",
    customerSubscriptionId: config.id,
    provider: "stripe",
    externalSubscriptionId: "sub-test-sync",
    providerStatus: "active",
    endedAt: null,
    providerItems,
  };
  const observed: ObservedStripeSubscription = {
    externalSubscriptionId: link.externalSubscriptionId,
    status: "active",
    currentPeriodStart: new Date("2098-10-01T00:00:00.000Z"),
    currentPeriodEnd: config.nextBillingDate,
    items: providerItems.map((item, index) => ({
      externalSubscriptionItemId: item.externalSubscriptionItemId,
      externalPriceId: item.externalPriceId,
      currency: item.currency,
      billingIntervalMonths: item.billingIntervalMonths,
      unitAmount: item.agreedAmountPerCycle,
      quantity: index === 1 ? 1 : item.quantity,
    })),
  };
  const proposal = buildCanonicalStripeOperationProposal({
    kind: "synchronization",
    configuration: config,
    providerLink: link,
    observed,
    observedOwnerSubscriptionId: config.id,
  });
  const fake = new FakeStripeApi();
  const providerPrices = providerItems.map((item) => price({
    id: item.externalPriceId,
    fingerprint: item.rateGroupFingerprint,
    amount: String(item.agreedAmountPerCycle),
    intervalMonths: item.billingIntervalMonths,
  }));
  fake.pricesData.push(...providerPrices);
  const providerSubscription = subscription({
    id: link.externalSubscriptionId,
    canonicalSubscriptionId: config.id,
    items: providerItems.map((item, index) => ({
      id: item.externalSubscriptionItemId,
      price: providerPrices[index],
      quantity: observed.items[index].quantity!,
    })),
    nextBillingDate: config.nextBillingDate!,
    intervalMonths: 1,
  });
  fake.subscriptionsData.set(providerSubscription.id, providerSubscription);
  const originalAnchor = providerSubscription.billing_cycle_anchor;
  const adapter = new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig);
  const result = await adapter.synchronizeSubscription(proposal, "sync-idempotency");
  assert.equal(fake.subscriptionUpdates[0].proration_behavior, "none");
  assert.equal(fake.subscriptionUpdates[0].billing_cycle_anchor, "unchanged");
  assert.equal(fake.subscriptionIdempotencyKeys[0], "sync-idempotency");
  assert.equal(fake.subscriptionsData.get(providerSubscription.id)?.billing_cycle_anchor, originalAnchor);
  assert.equal(reconcileCanonicalStripeTestProviderResult({ proposal, result }).status, "matched");
});

test("annual additions join at the preserved anniversary without Stripe proration", async () => {
  const activation = activationProposal({
    interval: 12,
    amounts: [{ id: "annual-service", amount: "275.00", classification: "negotiated" }],
  });
  const proposal: CanonicalStripeOperationProposal = {
    ...activation,
    kind: "synchronization",
    externalSubscriptionId: "sub-test-annual-addition",
    providerStateFingerprint: "approved-provider-state",
  };
  const fake = new FakeStripeApi();
  const providerSubscription = subscription({
    id: proposal.externalSubscriptionId!,
    canonicalSubscriptionId: proposal.subscriptionId,
    items: [],
    nextBillingDate: proposal.nextBillingDate,
    intervalMonths: 12,
  });
  fake.subscriptionsData.set(providerSubscription.id, providerSubscription);
  const adapter = new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig);
  const originalAnchor = providerSubscription.billing_cycle_anchor;
  const result = await adapter.synchronizeSubscription(proposal, "annual-addition-idempotency");
  assert.equal(fake.subscriptionUpdates[0].proration_behavior, "none");
  assert.equal(fake.subscriptionUpdates[0].billing_cycle_anchor, "unchanged");
  assert.equal(fake.subscriptionUpdates[0].add_invoice_items, undefined);
  assert.equal(fake.subscriptionsData.get(providerSubscription.id)?.billing_cycle_anchor, originalAnchor);
  assert.equal(result.rateGroups[0].agreedAmountPerCycle, "275.00");
  assert.equal(result.subscription.currentPeriodEnd?.toISOString(), proposal.nextBillingDate.toISOString());
});

test("Price replacement and rate-group retirement use one no-proration subscription update", async () => {
  const activation = activationProposal({ amounts: [{ id: "replacement", amount: "25.00" }] });
  const expectedGroup = activation.rateGroups[0];
  const proposal: CanonicalStripeOperationProposal = {
    ...activation,
    kind: "synchronization",
    externalSubscriptionId: "sub-test-replace-retire",
    providerStateFingerprint: "approved-provider-state",
    actions: [
      {
        kind: "replace_price",
        fingerprint: expectedGroup.fingerprint,
        externalSubscriptionItemId: "si-replace",
        externalPriceId: "price-old",
        fromQuantity: 1,
        toQuantity: 1,
        agreedAmountPerCycle: expectedGroup.agreedAmountPerCycle,
        subscriptionItemIds: expectedGroup.items.map((item) => item.subscriptionItemId),
      },
      {
        kind: "retire_rate_group",
        fingerprint: "XCD:1:30.00",
        externalSubscriptionItemId: "si-retire",
        externalPriceId: "price-retire",
        fromQuantity: 1,
        toQuantity: 0,
        agreedAmountPerCycle: null,
        subscriptionItemIds: [],
      },
    ],
  };
  const fake = new FakeStripeApi();
  const oldPrice = price({ id: "price-old", fingerprint: "XCD:1:24.00", amount: "24.00", intervalMonths: 1 });
  const retiredPrice = price({ id: "price-retire", fingerprint: "XCD:1:30.00", amount: "30.00", intervalMonths: 1 });
  const providerSubscription = subscription({
    id: proposal.externalSubscriptionId!,
    canonicalSubscriptionId: proposal.subscriptionId,
    items: [
      { id: "si-replace", price: oldPrice, quantity: 1 },
      { id: "si-retire", price: retiredPrice, quantity: 1 },
    ],
    nextBillingDate: proposal.nextBillingDate,
    intervalMonths: 1,
  });
  fake.subscriptionsData.set(providerSubscription.id, providerSubscription);
  const adapter = new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig);
  const result = await adapter.synchronizeSubscription(proposal, "replace-retire-idempotency");
  assert.equal(fake.subscriptionUpdates.length, 1);
  assert.equal(fake.subscriptionUpdates[0].proration_behavior, "none");
  assert.ok(fake.subscriptionUpdates[0].items?.some((item) => item.id === "si-retire" && item.deleted));
  assert.ok(fake.subscriptionUpdates[0].items?.some((item) => item.id === "si-replace" && Boolean(item.price)));
  assert.equal(result.rateGroups.length, 1);
  assert.equal(result.rateGroups[0].fingerprint, expectedGroup.fingerprint);
});

test("synchronization recovery recognizes only the durable operation metadata", async () => {
  const proposal = activationProposal();
  const providerPrices = proposal.rateGroups.map((group, index) => price({
    id: `price-recovery-${index}`,
    fingerprint: group.fingerprint,
    amount: group.agreedAmountPerCycle,
    intervalMonths: group.billingIntervalMonths,
  }));
  const fake = new FakeStripeApi();
  const providerSubscription = subscription({
    canonicalSubscriptionId: proposal.subscriptionId,
    items: proposal.rateGroups.map((group, index) => ({ id: `si-recovery-${index}`, price: providerPrices[index], quantity: group.quantity })),
    nextBillingDate: proposal.nextBillingDate,
    intervalMonths: proposal.billingIntervalMonths,
    lastOperationKey: proposal.operationKey,
  });
  fake.subscriptionsData.set(providerSubscription.id, providerSubscription);
  const adapter = new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig);
  assert.ok(await adapter.recoverSynchronization(proposal.operationKey, providerSubscription.id));
  assert.equal(await adapter.recoverSynchronization("wrong", providerSubscription.id), null);
});

test("provider ownership and live-mode objects are rejected before mutation", async () => {
  const proposal = {
    ...activationProposal(),
    kind: "synchronization" as const,
    externalSubscriptionId: "sub-live",
    actions: [],
  };
  const fake = new FakeStripeApi();
  const providerSubscription = subscription({
    id: "sub-live",
    canonicalSubscriptionId: "another-subscription",
    items: [],
    nextBillingDate: proposal.nextBillingDate,
    intervalMonths: proposal.billingIntervalMonths,
    livemode: true,
  });
  fake.subscriptionsData.set(providerSubscription.id, providerSubscription);
  const adapter = new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig);
  await assert.rejects(
    adapter.synchronizeSubscription(proposal, "forbidden"),
    (caught: unknown) => caught instanceof CanonicalStripeTestProviderError
      && caught.code === "LIVE_PROVIDER_OBJECT_REJECTED",
  );
  assert.equal(fake.subscriptionUpdates.length, 0);
});

test("reconciliation reports amount, quantity, interval and anchor discrepancies", () => {
  const proposal = activationProposal();
  const group = proposal.rateGroups[0];
  const result = {
    subscription: {
      externalSubscriptionId: "sub-discrepant",
      status: "active",
      currentPeriodStart: new Date("2098-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2098-10-31T00:00:00.000Z"),
      items: [],
    },
    rateGroups: [{
      fingerprint: group.fingerprint,
      externalSubscriptionItemId: "si-discrepant",
      externalPriceId: "price-discrepant",
      currency: "XCD",
      billingIntervalMonths: group.billingIntervalMonths,
      agreedAmountPerCycle: "21.00",
      quantity: 2,
    }],
  };
  const reconciliation = reconcileCanonicalStripeTestProviderResult({ proposal, result });
  assert.equal(reconciliation.status, "discrepant");
  assert.ok(reconciliation.differences.some((entry) => entry.code === "rate_group_mismatch"));
  assert.ok(reconciliation.differences.some((entry) => entry.code === "billing_anchor_mismatch"));
  assert.ok(reconciliation.differences.some((entry) => entry.code === "recurring_total_mismatch"));
});

test("test webhook signatures verify and live-mode payloads are rejected", () => {
  const stripe = new Stripe("sk_test_synthetic_only", { apiVersion: "2025-02-24.acacia" });
  const event = {
    id: "evt_test_canonical",
    object: "event",
    api_version: "2025-02-24.acacia",
    created: 1,
    data: { object: { id: "cs_test_1", object: "checkout.session" } },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: "checkout.session.completed",
  };
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: providerEnvironment.CANONICAL_STRIPE_TEST_WEBHOOK_SECRET!,
    timestamp: Math.floor(Date.now() / 1000),
  });
  assert.equal(constructCanonicalStripeTestWebhookEvent({ rawBody: payload, signature, environment: providerEnvironment, stripe }).id, event.id);
  const livePayload = JSON.stringify({ ...event, id: "evt_live_forbidden", livemode: true });
  const liveSignature = stripe.webhooks.generateTestHeaderString({
    payload: livePayload,
    secret: providerEnvironment.CANONICAL_STRIPE_TEST_WEBHOOK_SECRET!,
    timestamp: Math.floor(Date.now() / 1000),
  });
  assert.throws(
    () => constructCanonicalStripeTestWebhookEvent({ rawBody: livePayload, signature: liveSignature, environment: providerEnvironment, stripe }),
    (caught: unknown) => caught instanceof CanonicalStripeTestProviderError
      && caught.code === "LIVE_WEBHOOK_EVENT_REJECTED",
  );
});

test("invoice and payment retrieval exposes reconciliation fields without payment credentials", async () => {
  const fake = new FakeStripeApi();
  fake.invoicesData.push({
    id: "in_test_1",
    object: "invoice",
    amount_due: 7000,
    amount_paid: 7000,
    currency: "xcd",
    lines: {
      object: "list",
      data: [{ id: "il_test_1", object: "line_item", period: { start: 1, end: 2 } } as Stripe.InvoiceLineItem],
      has_more: false,
      url: "/v1/invoices/in_test_1/lines",
    },
    livemode: false,
    payment_intent: "pi_test_1",
    status: "paid",
    total: 7000,
  } as Stripe.Invoice);
  fake.paymentIntentsData.set("pi_test_1", {
    id: "pi_test_1",
    object: "payment_intent",
    amount: 7000,
    currency: "xcd",
    invoice: "in_test_1",
    livemode: false,
    metadata: {},
    status: "succeeded",
  } as Stripe.PaymentIntent & { invoice: string });
  const adapter = new StripeTestCanonicalProviderAdapter(fake.client(), providerConfig);
  assert.deepEqual(await adapter.retrieveInvoices("sub_test_1"), [{
    id: "in_test_1",
    status: "paid",
    currency: "XCD",
    total: "70.00",
    amountPaid: "70.00",
    paymentIntentId: "pi_test_1",
    periodStart: new Date(1000),
    periodEnd: new Date(2000),
  }]);
  assert.deepEqual(await adapter.retrievePayment("pi_test_1"), {
    id: "pi_test_1",
    status: "succeeded",
    currency: "XCD",
    amount: "70.00",
    invoiceId: "in_test_1",
  });
});
