import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import Stripe from "stripe";

import {
  assertCanonicalStripeTestProviderEnabled,
  type CanonicalStripeCheckoutSession,
  type CanonicalStripeExecutionEnvironment,
  type CanonicalStripeOperationProposal,
  type CanonicalStripeProviderAdapter,
  type CanonicalStripeProviderMutationResult,
} from "@/lib/domain/canonical-stripe-execution";
import {
  normalizeCanonicalStripeSubscription,
  stripePriceMajorAmount,
  stripeRecurringIntervalMonths,
} from "@/lib/stripe/canonical-provider-normalization";

export const CANONICAL_STRIPE_TEST_SECRET_KEY = "CANONICAL_STRIPE_TEST_SECRET_KEY";
export const CANONICAL_STRIPE_TEST_WEBHOOK_SECRET = "CANONICAL_STRIPE_TEST_WEBHOOK_SECRET";
export const CANONICAL_STRIPE_TEST_SUCCESS_URL = "CANONICAL_STRIPE_TEST_SUCCESS_URL";
export const CANONICAL_STRIPE_TEST_CANCEL_URL = "CANONICAL_STRIPE_TEST_CANCEL_URL";
export const CANONICAL_STRIPE_TEST_CURRENCY = "CANONICAL_STRIPE_TEST_CURRENCY";
export const CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT = "CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT";
export const CANONICAL_STRIPE_API_VERSION = "2025-02-24.acacia" as const;

export type CanonicalStripeTestProviderEnvironment = CanonicalStripeExecutionEnvironment & {
  CANONICAL_STRIPE_TEST_SECRET_KEY?: string;
  CANONICAL_STRIPE_TEST_WEBHOOK_SECRET?: string;
  CANONICAL_STRIPE_TEST_SUCCESS_URL?: string;
  CANONICAL_STRIPE_TEST_CANCEL_URL?: string;
  CANONICAL_STRIPE_TEST_CURRENCY?: string;
  CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT?: string;
};

export class CanonicalStripeTestProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalStripeTestProviderError";
    this.code = code;
  }
}

function providerError(code: string, message: string): never {
  throw new CanonicalStripeTestProviderError(code, message);
}

function absoluteHttpUrl(value: string | undefined, variable: string): string {
  const trimmed = value?.trim();
  if (!trimmed) providerError("TEST_PROVIDER_CONFIGURATION_MISSING", `${variable} is required.`);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    providerError("TEST_PROVIDER_CONFIGURATION_INVALID", `${variable} must be an absolute URL.`);
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) {
    providerError("TEST_PROVIDER_CONFIGURATION_INVALID", `${variable} must use HTTP or HTTPS.`);
  }
  return parsed.toString();
}

function testSecretKey(environment: CanonicalStripeTestProviderEnvironment): string {
  const key = environment.CANONICAL_STRIPE_TEST_SECRET_KEY?.trim();
  if (!key) {
    providerError(
      "TEST_PROVIDER_CONFIGURATION_MISSING",
      `${CANONICAL_STRIPE_TEST_SECRET_KEY} is required and is never read from STRIPE_SECRET_KEY.`,
    );
  }
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    providerError("LIVE_SECRET_KEY_REJECTED", "Live Stripe credentials are forbidden for canonical test-provider execution.");
  }
  if (!key.startsWith("sk_test_")) {
    providerError("TEST_SECRET_KEY_REQUIRED", "A Stripe test-mode secret key beginning with sk_test_ is required.");
  }
  return key;
}

function webhookSecret(environment: CanonicalStripeTestProviderEnvironment): string {
  const secret = environment.CANONICAL_STRIPE_TEST_WEBHOOK_SECRET?.trim();
  if (!secret || !secret.startsWith("whsec_")) {
    providerError(
      "TEST_WEBHOOK_SECRET_REQUIRED",
      `${CANONICAL_STRIPE_TEST_WEBHOOK_SECRET} must contain the isolated test endpoint signing secret.`,
    );
  }
  return secret;
}

export function canonicalStripeTestCurrencyConfiguration(environment: CanonicalStripeTestProviderEnvironment): {
  currency: string;
  minorUnitExponent: number;
} {
  const currency = environment.CANONICAL_STRIPE_TEST_CURRENCY?.trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    providerError(
      "TEST_CURRENCY_REQUIRED",
      `${CANONICAL_STRIPE_TEST_CURRENCY} must explicitly identify the three-letter test currency.`,
    );
  }
  const rawExponent = environment.CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT?.trim();
  const minorUnitExponent = rawExponent == null || rawExponent === "" ? Number.NaN : Number(rawExponent);
  if (!Number.isInteger(minorUnitExponent) || minorUnitExponent < 0 || minorUnitExponent > 6) {
    providerError(
      "TEST_CURRENCY_PRECISION_REQUIRED",
      `${CANONICAL_STRIPE_TEST_MINOR_UNIT_EXPONENT} must explicitly identify the currency minor-unit exponent.`,
    );
  }
  return { currency, minorUnitExponent };
}

export type CanonicalStripeTestProviderConfig = {
  successUrl: string;
  cancelUrl: string;
  currency: string;
  minorUnitExponent: number;
};

export function canonicalStripeTestProviderConfig(
  environment: CanonicalStripeTestProviderEnvironment = process.env,
): CanonicalStripeTestProviderConfig {
  assertCanonicalStripeTestProviderEnabled(environment);
  testSecretKey(environment);
  const currency = canonicalStripeTestCurrencyConfiguration(environment);
  return {
    successUrl: absoluteHttpUrl(environment.CANONICAL_STRIPE_TEST_SUCCESS_URL, CANONICAL_STRIPE_TEST_SUCCESS_URL),
    cancelUrl: absoluteHttpUrl(environment.CANONICAL_STRIPE_TEST_CANCEL_URL, CANONICAL_STRIPE_TEST_CANCEL_URL),
    ...currency,
  };
}

function assertTestModeObject(value: { livemode?: boolean }, label: string): void {
  if (value.livemode !== false) {
    providerError("LIVE_PROVIDER_OBJECT_REJECTED", `${label} is not verified as a Stripe test-mode object.`);
  }
}

function operationIdempotencyKey(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${prefix}:${digest}`;
}

function metadataValue(value: string): string {
  return value.slice(0, 500);
}

function priceLookupKey(fingerprint: string): string {
  return `tl_canonical_test_${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function recurringParameters(months: number): Stripe.PriceCreateParams.Recurring {
  if (months === 12) return { interval: "year", interval_count: 1, usage_type: "licensed" };
  if ([1, 3, 6].includes(months)) {
    return { interval: "month", interval_count: months, usage_type: "licensed" };
  }
  providerError("UNSUPPORTED_RECURRING_INTERVAL", `Stripe test mode does not support a ${months}-month canonical interval.`);
}

export function canonicalMajorAmountToStripeMinor(
  amount: string,
  minorUnitExponent: number,
): number {
  if (!Number.isInteger(minorUnitExponent) || minorUnitExponent < 0 || minorUnitExponent > 6) {
    providerError("CURRENCY_PRECISION_INVALID", "Currency minor-unit exponent is invalid.");
  }
  const decimal = new Prisma.Decimal(amount);
  if (decimal.isNegative()) providerError("AMOUNT_INVALID", "Stripe recurring amounts cannot be negative.");
  const minor = decimal.times(new Prisma.Decimal(10).pow(minorUnitExponent));
  if (!minor.isInteger()) {
    providerError("AMOUNT_PRECISION_INVALID", "Agreed amount cannot be represented exactly in the configured Stripe currency.");
  }
  const numeric = minor.toNumber();
  if (!Number.isSafeInteger(numeric)) providerError("AMOUNT_OUT_OF_RANGE", "Agreed amount exceeds Stripe's safe integer range.");
  return numeric;
}

function checkoutSessionResult(session: Stripe.Checkout.Session): CanonicalStripeCheckoutSession {
  assertTestModeObject(session, "Checkout Session");
  const subscription = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  return {
    id: session.id,
    status: session.status ?? "open",
    url: session.url,
    externalSubscriptionId: subscription,
  };
}

function sameUtcDay(left: Date | null, right: Date): boolean {
  return left != null && left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

export type CanonicalStripeProviderDifference = {
  code: string;
  fingerprint: string | null;
  expected: string | null;
  actual: string | null;
  explanation: string;
};

export type CanonicalStripeProviderReconciliation = {
  status: "matched" | "discrepant";
  expectedRecurringAmount: string;
  actualRecurringAmount: string;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
  differences: CanonicalStripeProviderDifference[];
};

export function reconcileCanonicalStripeTestProviderResult(input: {
  proposal: CanonicalStripeOperationProposal;
  result: CanonicalStripeProviderMutationResult;
}): CanonicalStripeProviderReconciliation {
  const expectedByFingerprint = new Map(input.proposal.rateGroups.map((group) => [group.fingerprint, group]));
  const actualByFingerprint = new Map(input.result.rateGroups.map((group) => [group.fingerprint, group]));
  const differences: CanonicalStripeProviderDifference[] = [];
  for (const [fingerprint, expected] of expectedByFingerprint) {
    const actual = actualByFingerprint.get(fingerprint);
    if (!actual) {
      differences.push({
        code: "missing_rate_group",
        fingerprint,
        expected: `${expected.currency}:${expected.billingIntervalMonths}:${expected.agreedAmountPerCycle}:${expected.quantity}`,
        actual: null,
        explanation: "Stripe is missing an approved recurring rate group.",
      });
      continue;
    }
    const expectedValue = `${expected.currency}:${expected.billingIntervalMonths}:${expected.agreedAmountPerCycle}:${expected.quantity}`;
    const actualValue = `${actual.currency.toUpperCase()}:${actual.billingIntervalMonths}:${new Prisma.Decimal(actual.agreedAmountPerCycle).toFixed(2)}:${actual.quantity}`;
    if (expectedValue !== actualValue) {
      differences.push({
        code: "rate_group_mismatch",
        fingerprint,
        expected: expectedValue,
        actual: actualValue,
        explanation: "Stripe Price terms or quantity differ from the approved canonical rate group.",
      });
    }
  }
  for (const fingerprint of actualByFingerprint.keys()) {
    if (!expectedByFingerprint.has(fingerprint)) {
      differences.push({
        code: "unexpected_rate_group",
        fingerprint,
        expected: null,
        actual: fingerprint,
        explanation: "Stripe contains a recurring rate group not present in canonical commercial state.",
      });
    }
  }
  if (!sameUtcDay(input.result.subscription.currentPeriodEnd, input.proposal.nextBillingDate)) {
    differences.push({
      code: "billing_anchor_mismatch",
      fingerprint: null,
      expected: input.proposal.nextBillingDate.toISOString().slice(0, 10),
      actual: input.result.subscription.currentPeriodEnd?.toISOString().slice(0, 10) ?? null,
      explanation: "Stripe's current period end does not preserve the approved next billing date.",
    });
  }
  const actualRecurring = input.result.rateGroups.reduce(
    (total, group) => total.plus(new Prisma.Decimal(group.agreedAmountPerCycle).times(group.quantity)),
    new Prisma.Decimal(0),
  ).toDecimalPlaces(2).toFixed(2);
  if (actualRecurring !== input.proposal.expectedRecurringTotal) {
    differences.push({
      code: "recurring_total_mismatch",
      fingerprint: null,
      expected: input.proposal.expectedRecurringTotal,
      actual: actualRecurring,
      explanation: "Stripe's recurring amount differs from canonical commercial state.",
    });
  }
  differences.sort((left, right) => [left.code, left.fingerprint ?? ""].join("\u0000")
    .localeCompare([right.code, right.fingerprint ?? ""].join("\u0000")));
  return {
    status: differences.length ? "discrepant" : "matched",
    expectedRecurringAmount: input.proposal.expectedRecurringTotal,
    actualRecurringAmount: actualRecurring,
    billingPeriodStart: input.result.subscription.currentPeriodStart,
    billingPeriodEnd: input.result.subscription.currentPeriodEnd,
    differences,
  };
}

export type CanonicalStripeProviderInvoice = {
  id: string;
  status: string;
  currency: string;
  total: string;
  amountPaid: string;
  paymentIntentId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};

export type CanonicalStripeProviderPayment = {
  id: string;
  status: string;
  currency: string;
  amount: string;
  invoiceId: string | null;
};

export class StripeTestCanonicalProviderAdapter implements CanonicalStripeProviderAdapter {
  readonly kind = "stripe_test" as const;

  constructor(
    private readonly stripe: Stripe,
    private readonly config: CanonicalStripeTestProviderConfig,
  ) {}

  private assertCurrency(currency: string): void {
    if (currency.toUpperCase() !== this.config.currency) {
      providerError(
        "CURRENCY_NOT_AUTHORIZED",
        `Canonical Stripe test execution is restricted to ${this.config.currency}.`,
      );
    }
  }

  private async ensureTestCustomer(customerId: string): Promise<Stripe.Customer> {
    const safeCustomerId = customerId.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    const candidates = await this.stripe.customers.search({
      query: `metadata['tl_canonical_customer_id']:'${safeCustomerId}'`,
      limit: 100,
    });
    const existing = candidates.data.find((customer) => !customer.deleted);
    if (existing) {
      assertTestModeObject(existing, "Customer");
      return existing;
    }
    const created = await this.stripe.customers.create({
      description: "Synthetic TL canonical test customer",
      metadata: {
        tl_canonical_customer_id: metadataValue(customerId),
        tl_provider_mode: "test",
      },
    }, {
      idempotencyKey: operationIdempotencyKey("tl-canonical-test-customer", customerId),
    });
    assertTestModeObject(created, "Customer");
    return created;
  }

  private priceCompatible(price: Stripe.Price, input: {
    fingerprint: string;
    currency: string;
    billingIntervalMonths: number;
    agreedAmountPerCycle: string;
  }): boolean {
    if (price.livemode !== false || !price.active || price.type !== "recurring") return false;
    if (price.metadata?.tl_rate_group_fingerprint !== input.fingerprint) return false;
    if (price.currency.toUpperCase() !== input.currency.toUpperCase()) return false;
    if (stripeRecurringIntervalMonths(price) !== input.billingIntervalMonths) return false;
    const amount = stripePriceMajorAmount(price, this.config.minorUnitExponent);
    return amount != null && new Prisma.Decimal(amount).equals(input.agreedAmountPerCycle);
  }

  private async ensurePrice(group: CanonicalStripeOperationProposal["rateGroups"][number]): Promise<Stripe.Price> {
    this.assertCurrency(group.currency);
    const lookupKey = priceLookupKey(group.fingerprint);
    const existing = await this.stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 10 });
    for (const price of existing.data) assertTestModeObject(price, "Price");
    if (existing.data.length > 1) {
      providerError("PRICE_LOOKUP_AMBIGUOUS", "Stripe returned multiple active Prices for one canonical fingerprint.");
    }
    const matched = existing.data[0];
    if (matched) {
      if (!this.priceCompatible(matched, group)) {
        providerError("PRICE_FINGERPRINT_CONFLICT", "Existing Stripe Price is incompatible with canonical billing terms.");
      }
      return matched;
    }
    const created = await this.stripe.prices.create({
      currency: group.currency.toLowerCase(),
      unit_amount: canonicalMajorAmountToStripeMinor(group.agreedAmountPerCycle, this.config.minorUnitExponent),
      recurring: recurringParameters(group.billingIntervalMonths),
      lookup_key: lookupKey,
      nickname: `TL canonical ${group.billingIntervalMonths}-month test rate`,
      product_data: {
        name: "TL canonical tracking service (test mode)",
        metadata: { tl_provider_mode: "test" },
      },
      metadata: {
        tl_rate_group_fingerprint: metadataValue(group.fingerprint),
        tl_billing_interval_months: String(group.billingIntervalMonths),
        tl_agreed_amount_per_cycle: group.agreedAmountPerCycle,
        tl_provider_mode: "test",
      },
    }, {
      idempotencyKey: operationIdempotencyKey("tl-canonical-test-price", group.fingerprint),
    });
    assertTestModeObject(created, "Price");
    if (!this.priceCompatible(created, group)) {
      providerError("PRICE_CREATE_MISMATCH", "Stripe created a Price that does not match canonical billing terms.");
    }
    return created;
  }

  private assertSubscriptionOwnership(subscription: Stripe.Subscription, subscriptionId: string): void {
    assertTestModeObject(subscription, "Subscription");
    if (subscription.metadata?.tl_canonical_subscription_id !== subscriptionId) {
      providerError("PROVIDER_OWNERSHIP_MISMATCH", "Stripe subscription metadata does not prove exact canonical ownership.");
    }
  }

  async retrieveSubscription(externalSubscriptionId: string) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(externalSubscriptionId, {
        expand: ["items.data.price"],
      });
      assertTestModeObject(subscription, "Subscription");
      return normalizeCanonicalStripeSubscription(subscription, this.config.minorUnitExponent).subscription;
    } catch (caught) {
      if ((caught as { code?: string })?.code === "resource_missing") return null;
      throw caught;
    }
  }

  async retrieveCheckoutSession(
    sessionId: string,
    operationKey: string,
    subscriptionId: string,
  ): Promise<CanonicalStripeCheckoutSession> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    if (
      session.metadata?.tl_canonical_operation_key !== operationKey
      || session.metadata?.tl_canonical_subscription_id !== subscriptionId
    ) {
      providerError("PROVIDER_OWNERSHIP_MISMATCH", "Checkout Session metadata does not match the exact canonical operation.");
    }
    return checkoutSessionResult(session);
  }

  async recoverActivation(operationKey: string, subscriptionId: string): Promise<CanonicalStripeCheckoutSession | null> {
    const sessions = await this.stripe.checkout.sessions.list({ limit: 100 });
    const session = sessions.data.find((candidate) =>
      candidate.metadata?.tl_canonical_operation_key === operationKey
      && candidate.metadata?.tl_canonical_subscription_id === subscriptionId);
    return session ? checkoutSessionResult(session) : null;
  }

  async createActivationCheckout(
    proposal: CanonicalStripeOperationProposal,
    idempotencyKey: string,
  ): Promise<CanonicalStripeCheckoutSession> {
    this.assertCurrency(proposal.currency);
    const [customer, ...prices] = await Promise.all([
      this.ensureTestCustomer(proposal.customerId),
      ...proposal.rateGroups.map((group) => this.ensurePrice(group)),
    ]);
    const metadata: Stripe.MetadataParam = {
      tl_canonical_operation_key: metadataValue(proposal.operationKey),
      tl_canonical_subscription_id: metadataValue(proposal.subscriptionId),
      tl_customer_id: metadataValue(proposal.customerId),
      tl_provider_mode: "test",
    };
    const anchor = Math.floor(proposal.nextBillingDate.getTime() / 1000);
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: proposal.subscriptionId,
      line_items: proposal.rateGroups.map((group, index) => ({
        price: prices[index].id,
        quantity: group.quantity,
      })),
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
      metadata,
      subscription_data: {
        billing_cycle_anchor: anchor,
        proration_behavior: "none",
        metadata,
      },
    }, { idempotencyKey });
    return checkoutSessionResult(session);
  }

  async expireCheckoutSession(sessionId: string, idempotencyKey: string): Promise<CanonicalStripeCheckoutSession> {
    const session = await this.stripe.checkout.sessions.expire(sessionId, {}, { idempotencyKey });
    return checkoutSessionResult(session);
  }

  async recoverSynchronization(
    operationKey: string,
    externalSubscriptionId: string,
  ): Promise<CanonicalStripeProviderMutationResult | null> {
    const subscription = await this.stripe.subscriptions.retrieve(externalSubscriptionId, {
      expand: ["items.data.price"],
    });
    assertTestModeObject(subscription, "Subscription");
    if (subscription.metadata?.tl_canonical_last_operation_key !== operationKey) return null;
    return normalizeCanonicalStripeSubscription(subscription, this.config.minorUnitExponent);
  }

  async synchronizeSubscription(
    proposal: CanonicalStripeOperationProposal,
    idempotencyKey: string,
  ): Promise<CanonicalStripeProviderMutationResult> {
    const externalSubscriptionId = proposal.externalSubscriptionId;
    if (!externalSubscriptionId) providerError("PROVIDER_SUBSCRIPTION_REQUIRED", "Synchronization requires a Stripe subscription ID.");
    const current = await this.stripe.subscriptions.retrieve(externalSubscriptionId, {
      expand: ["items.data.price"],
    });
    this.assertSubscriptionOwnership(current, proposal.subscriptionId);
    const originalAnchor = current.billing_cycle_anchor;
    const groupByFingerprint = new Map(proposal.rateGroups.map((group) => [group.fingerprint, group]));
    const priceEntries = await Promise.all(proposal.actions
      .filter((action) => action.kind === "create_rate_group" || action.kind === "replace_price")
      .map(async (action) => {
        const group = groupByFingerprint.get(action.fingerprint);
        if (!group) providerError("APPROVED_RATE_GROUP_MISSING", "Approved synchronization action has no canonical rate group.");
        return [action.fingerprint, await this.ensurePrice(group)] as const;
      }));
    const prices = new Map(priceEntries);
    const items: Stripe.SubscriptionUpdateParams.Item[] = proposal.actions.map((action) => {
      if (action.kind === "retire_rate_group") {
        if (!action.externalSubscriptionItemId) providerError("PROVIDER_ITEM_REQUIRED", "Retiring a rate group requires a Stripe item ID.");
        return { id: action.externalSubscriptionItemId, deleted: true };
      }
      if (action.kind === "update_quantity") {
        if (!action.externalSubscriptionItemId) providerError("PROVIDER_ITEM_REQUIRED", "Quantity updates require a Stripe item ID.");
        return { id: action.externalSubscriptionItemId, quantity: action.toQuantity };
      }
      const price = prices.get(action.fingerprint);
      if (!price) providerError("PROVIDER_PRICE_REQUIRED", "Creating or replacing a rate group requires a verified Stripe Price.");
      return action.externalSubscriptionItemId
        ? { id: action.externalSubscriptionItemId, price: price.id, quantity: action.toQuantity }
        : { price: price.id, quantity: action.toQuantity };
    });
    const updated = await this.stripe.subscriptions.update(externalSubscriptionId, {
      items,
      billing_cycle_anchor: "unchanged",
      proration_behavior: "none",
      metadata: {
        ...current.metadata,
        tl_canonical_subscription_id: metadataValue(proposal.subscriptionId),
        tl_canonical_last_operation_key: metadataValue(proposal.operationKey),
        tl_provider_mode: "test",
      },
      expand: ["items.data.price"],
    }, { idempotencyKey });
    this.assertSubscriptionOwnership(updated, proposal.subscriptionId);
    if (updated.billing_cycle_anchor !== originalAnchor) {
      providerError("BILLING_ANCHOR_CHANGED", "Stripe changed the subscription billing anchor unexpectedly.");
    }
    const result = normalizeCanonicalStripeSubscription(updated, this.config.minorUnitExponent);
    const reconciliation = reconcileCanonicalStripeTestProviderResult({ proposal, result });
    if (reconciliation.status !== "matched") {
      providerError(
        "POST_PROVIDER_RECONCILIATION_FAILED",
        reconciliation.differences[0]?.explanation ?? "Stripe response does not match canonical commercial state.",
      );
    }
    return result;
  }

  async retrieveInvoices(externalSubscriptionId: string): Promise<CanonicalStripeProviderInvoice[]> {
    const invoices = await this.stripe.invoices.list({
      subscription: externalSubscriptionId,
      limit: 100,
      expand: ["data.payment_intent"],
    });
    return invoices.data.map((invoice) => {
      assertTestModeObject(invoice, "Invoice");
      const lines = invoice.lines?.data ?? [];
      const starts = lines.map((line) => line.period?.start).filter((value): value is number => value != null);
      const ends = lines.map((line) => line.period?.end).filter((value): value is number => value != null);
      const paymentIntent = invoice.payment_intent;
      return {
        id: invoice.id,
        status: invoice.status ?? "unknown",
        currency: invoice.currency.toUpperCase(),
        total: new Prisma.Decimal(invoice.total ?? invoice.amount_due ?? 0)
          .dividedBy(new Prisma.Decimal(10).pow(this.config.minorUnitExponent))
          .toFixed(this.config.minorUnitExponent),
        amountPaid: new Prisma.Decimal(invoice.amount_paid)
          .dividedBy(new Prisma.Decimal(10).pow(this.config.minorUnitExponent))
          .toFixed(this.config.minorUnitExponent),
        paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
        periodStart: starts.length ? new Date(Math.min(...starts) * 1000) : null,
        periodEnd: ends.length ? new Date(Math.max(...ends) * 1000) : null,
      };
    });
  }

  async retrievePayment(paymentIntentId: string): Promise<CanonicalStripeProviderPayment> {
    const payment = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    assertTestModeObject(payment, "PaymentIntent");
    const invoice = (payment as Stripe.PaymentIntent & { invoice?: string | Stripe.Invoice | null }).invoice;
    return {
      id: payment.id,
      status: payment.status,
      currency: payment.currency.toUpperCase(),
      amount: new Prisma.Decimal(payment.amount)
        .dividedBy(new Prisma.Decimal(10).pow(this.config.minorUnitExponent))
        .toFixed(this.config.minorUnitExponent),
      invoiceId: typeof invoice === "string" ? invoice : invoice?.id ?? null,
    };
  }
}

export function createStripeTestCanonicalProviderAdapter(
  environment: CanonicalStripeTestProviderEnvironment = process.env,
): StripeTestCanonicalProviderAdapter {
  const config = canonicalStripeTestProviderConfig(environment);
  const stripe = new Stripe(testSecretKey(environment), {
    apiVersion: CANONICAL_STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 30_000,
  });
  return new StripeTestCanonicalProviderAdapter(stripe, config);
}

export function constructCanonicalStripeTestWebhookEvent(input: {
  rawBody: string | Buffer;
  signature: string;
  environment?: CanonicalStripeTestProviderEnvironment;
  stripe?: Stripe;
}): Stripe.Event {
  const environment = input.environment ?? process.env;
  assertCanonicalStripeTestProviderEnabled(environment);
  const stripe = input.stripe ?? new Stripe(testSecretKey(environment), {
    apiVersion: CANONICAL_STRIPE_API_VERSION,
  });
  const event = stripe.webhooks.constructEvent(input.rawBody, input.signature, webhookSecret(environment));
  if (event.livemode !== false) {
    providerError("LIVE_WEBHOOK_EVENT_REJECTED", "Live Stripe webhook events are forbidden on the canonical test endpoint.");
  }
  return event;
}
