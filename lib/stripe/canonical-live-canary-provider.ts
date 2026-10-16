import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import Stripe from "stripe";

import {
  assertCanonicalStripeLiveCanaryAuthorization,
  assertCanonicalStripeLiveCanaryEnvironment,
  CanonicalStripeLiveCanaryError,
  LIVE_CANARY_CURRENCY,
  LIVE_CANARY_MAX_RECURRING_AMOUNT,
  type CanonicalStripeLiveCanaryAuthorization,
  type CanonicalStripeLiveCanaryEnvironment,
} from "@/lib/domain/canonical-stripe-live-canary";
import type {
  CanonicalStripeCheckoutSession,
  CanonicalStripeOperationProposal,
  CanonicalStripeProviderAdapter,
} from "@/lib/domain/canonical-stripe-execution";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import {
  normalizeCanonicalStripeSubscription,
  stripePriceMajorAmount,
  stripeRecurringIntervalMonths,
} from "@/lib/stripe/canonical-provider-normalization";
import {
  CANONICAL_STRIPE_API_VERSION,
  canonicalMajorAmountToStripeMinor,
  reconcileCanonicalStripeTestProviderResult,
  type CanonicalStripeProviderInvoice,
  type CanonicalStripeProviderPayment,
} from "@/lib/stripe/canonical-test-provider";

export type CanonicalStripeLiveCanaryProviderConfig = {
  expectedAccountId: string;
  authorizationId: string;
  authorization: CanonicalStripeLiveCanaryAuthorization;
  proposal: CanonicalStripeOperationProposal;
  environment: CanonicalStripeLiveCanaryEnvironment;
  successUrl: string;
  cancelUrl: string;
  currency: typeof LIVE_CANARY_CURRENCY;
  minorUnitExponent: 2;
};

function providerError(code: string, message: string): never {
  throw new CanonicalStripeLiveCanaryError(code, message);
}

function liveSecretKey(environment: CanonicalStripeLiveCanaryEnvironment): string {
  const key = environment.STRIPE_SECRET_KEY?.trim();
  if (!key || (!key.startsWith("sk_live_") && !key.startsWith("rk_live_"))) {
    providerError("CANARY_LIVE_KEY_REQUIRED", "The existing production Stripe credential must be explicitly live mode.");
  }
  return key;
}

function assertLiveModeObject(value: { livemode?: boolean }, label: string): void {
  if (value.livemode !== true) {
    providerError("CANARY_LIVE_OBJECT_REQUIRED", `${label} was not verified as a live-mode Stripe object.`);
  }
}

function metadataValue(value: string): string {
  return value.slice(0, 500);
}

function operationIdempotencyKey(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex")}`;
}

function priceLookupKey(fingerprint: string): string {
  return `tl_canonical_canary_${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function recurringParameters(months: number): Stripe.PriceCreateParams.Recurring {
  if (months !== 1) providerError("CANARY_MONTHLY_ONLY", "The live canary permits monthly recurring Prices only.");
  return { interval: "month", interval_count: 1, usage_type: "licensed" };
}

function liveCheckoutSessionResult(
  session: Stripe.Checkout.Session,
  config: CanonicalStripeLiveCanaryProviderConfig,
): CanonicalStripeCheckoutSession {
  assertLiveModeObject(session, "Checkout Session");
  if (
    session.metadata?.tl_provider_mode !== "live_canary"
    || session.metadata?.tl_canary_authorization_id !== config.authorizationId
  ) {
    providerError("CANARY_PROVIDER_OWNERSHIP_MISMATCH", "Checkout Session is not owned by the approved live canary.");
  }
  const subscription = session.subscription;
  return {
    id: session.id,
    status: session.status === "complete" ? "complete" : session.status === "expired" ? "expired" : "open",
    url: session.url,
    externalSubscriptionId: typeof subscription === "string" ? subscription : subscription?.id ?? null,
  };
}

export function canonicalStripeLiveCanaryProviderConfig(input: {
  authorization: CanonicalStripeLiveCanaryAuthorization;
  proposal: CanonicalStripeOperationProposal;
  environment?: CanonicalStripeLiveCanaryEnvironment;
}): CanonicalStripeLiveCanaryProviderConfig {
  const environment = input.environment ?? process.env;
  assertCanonicalStripeLiveCanaryEnvironment(environment);
  liveSecretKey(environment);
  const baseUrl = getAppBaseUrl();
  return {
    expectedAccountId: environment.CANONICAL_STRIPE_LIVE_CANARY_STRIPE_ACCOUNT_ID!.trim(),
    authorizationId: input.authorization.authorizationId,
    authorization: input.authorization,
    proposal: input.proposal,
    environment,
    successUrl: `${baseUrl}/pay/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/pay/cancel`,
    currency: LIVE_CANARY_CURRENCY,
    minorUnitExponent: 2,
  };
}

export class StripeLiveCanaryCanonicalProviderAdapter implements CanonicalStripeProviderAdapter {
  readonly kind = "stripe_live_canary" as const;
  readonly liveCanaryAuthorizationId: string;
  private verifiedAccount = false;

  constructor(
    private readonly stripe: Stripe,
    private readonly config: CanonicalStripeLiveCanaryProviderConfig,
  ) {
    this.liveCanaryAuthorizationId = config.authorizationId;
  }

  async verifyAccountContext(): Promise<void> {
    if (this.verifiedAccount) return;
    const account = await this.stripe.accounts.retrieve();
    if (account.id !== this.config.expectedAccountId) {
      providerError("CANARY_STRIPE_ACCOUNT_MISMATCH", "Stripe credentials belong to a different account than the approved canary.");
    }
    if (!account.charges_enabled) {
      providerError("CANARY_STRIPE_ACCOUNT_NOT_CHARGEABLE", "The approved Stripe account is not enabled to accept charges.");
    }
    this.verifiedAccount = true;
  }

  private assertCurrencyAndAmount(currency: string, amount: string, quantity: number): void {
    if (currency.toUpperCase() !== this.config.currency) {
      providerError("CANARY_CURRENCY_NOT_AUTHORIZED", "The live canary is restricted to XCD; no currency fallback is permitted.");
    }
    const unitAmount = new Prisma.Decimal(amount);
    const total = unitAmount.times(quantity);
    if (unitAmount.lessThanOrEqualTo(0) || total.greaterThan(LIVE_CANARY_MAX_RECURRING_AMOUNT)) {
      providerError("CANARY_CHARGE_CAP_EXCEEDED", `The approved recurring total may not exceed EC$${LIVE_CANARY_MAX_RECURRING_AMOUNT}.`);
    }
    canonicalMajorAmountToStripeMinor(unitAmount.toFixed(2), this.config.minorUnitExponent);
  }

  private assertAuthorizedMutation(input: {
    operation: "activate_subscription" | "cancel_subscription_at_period_end";
    proposal?: CanonicalStripeOperationProposal;
    externalSubscriptionId?: string | null;
  }): CanonicalStripeOperationProposal {
    const proposal = input.proposal ?? this.config.proposal;
    assertCanonicalStripeLiveCanaryAuthorization({
      proposal,
      authorization: this.config.authorization,
      expectedOperation: input.operation,
      externalSubscriptionId: input.externalSubscriptionId,
      environment: this.config.environment,
    });
    return proposal;
  }

  private assertActivationIdempotencyKey(idempotencyKey: string): "initial" | "replacement" {
    const initial = `tl-canonical-activation:${this.config.proposal.operationKey}`;
    const replacement = `tl-canonical-activation-replace:${this.config.proposal.operationKey}`;
    if (idempotencyKey === initial) return "initial";
    if (idempotencyKey === replacement) return "replacement";
    providerError("CANARY_IDEMPOTENCY_KEY_MISMATCH", "The provider mutation idempotency key is not bound to the approved operation.");
  }

  private async ensureCustomer(customerId: string): Promise<Stripe.Customer> {
    await this.verifyAccountContext();
    const safeCustomerId = customerId.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    for (const metadataKey of ["tl_customer_id", "tl_canonical_customer_id"]) {
      const candidates = await this.stripe.customers.search({
        query: `metadata['${metadataKey}']:'${safeCustomerId}'`,
        limit: 100,
      });
      const existing = candidates.data.find((customer) => !customer.deleted);
      if (existing) {
        assertLiveModeObject(existing, "Customer");
        return existing;
      }
    }
    const created = await this.stripe.customers.create({
      description: "TL canonical live canary customer",
      metadata: {
        tl_customer_id: metadataValue(customerId),
        tl_canonical_customer_id: metadataValue(customerId),
        tl_provider_mode: "live_canary",
        tl_canary_authorization_id: metadataValue(this.config.authorizationId),
      },
    }, {
      idempotencyKey: operationIdempotencyKey("tl-canonical-live-canary-customer", customerId),
    });
    assertLiveModeObject(created, "Customer");
    return created;
  }

  private priceCompatible(price: Stripe.Price, group: CanonicalStripeOperationProposal["rateGroups"][number]): boolean {
    if (price.livemode !== true || !price.active || price.type !== "recurring") return false;
    if (price.metadata?.tl_rate_group_fingerprint !== group.fingerprint) return false;
    if (price.metadata?.tl_provider_mode !== "live_canary") return false;
    if (price.metadata?.tl_canary_authorization_id !== this.config.authorizationId) return false;
    if (price.currency.toUpperCase() !== group.currency.toUpperCase()) return false;
    if (stripeRecurringIntervalMonths(price) !== group.billingIntervalMonths) return false;
    const amount = stripePriceMajorAmount(price, this.config.minorUnitExponent);
    return amount != null && new Prisma.Decimal(amount).equals(group.agreedAmountPerCycle);
  }

  private async ensurePrice(group: CanonicalStripeOperationProposal["rateGroups"][number]): Promise<Stripe.Price> {
    await this.verifyAccountContext();
    this.assertCurrencyAndAmount(group.currency, group.agreedAmountPerCycle, group.quantity);
    if (group.billingIntervalMonths !== 1) providerError("CANARY_MONTHLY_ONLY", "The live canary permits monthly Prices only.");
    const lookupKey = priceLookupKey(group.fingerprint);
    const existing = await this.stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 10 });
    for (const price of existing.data) assertLiveModeObject(price, "Price");
    if (existing.data.length > 1) providerError("CANARY_PRICE_AMBIGUOUS", "Multiple active Prices share one canary lookup key.");
    if (existing.data[0]) {
      if (!this.priceCompatible(existing.data[0], group)) {
        providerError("CANARY_PRICE_CONFLICT", "An existing canary Price conflicts with the approved commercial terms.");
      }
      return existing.data[0];
    }
    const price = await this.stripe.prices.create({
      currency: group.currency.toLowerCase(),
      unit_amount: canonicalMajorAmountToStripeMinor(group.agreedAmountPerCycle, this.config.minorUnitExponent),
      recurring: recurringParameters(group.billingIntervalMonths),
      lookup_key: lookupKey,
      nickname: "TL canonical monthly live canary",
      product_data: {
        name: "Track Lucia tracking service",
        metadata: {
          tl_provider_mode: "live_canary",
          tl_canary_authorization_id: metadataValue(this.config.authorizationId),
        },
      },
      metadata: {
        tl_rate_group_fingerprint: metadataValue(group.fingerprint),
        tl_billing_interval_months: "1",
        tl_agreed_amount_per_cycle: group.agreedAmountPerCycle,
        tl_provider_mode: "live_canary",
        tl_canary_authorization_id: metadataValue(this.config.authorizationId),
      },
    }, {
      idempotencyKey: operationIdempotencyKey("tl-canonical-live-canary-price", `${this.config.authorizationId}:${group.fingerprint}`),
    });
    assertLiveModeObject(price, "Price");
    if (!this.priceCompatible(price, group)) providerError("CANARY_PRICE_CREATE_MISMATCH", "Stripe created an unexpected Price.");
    return price;
  }

  private assertSubscriptionOwnership(subscription: Stripe.Subscription, subscriptionId: string): void {
    assertLiveModeObject(subscription, "Subscription");
    if (
      subscription.metadata?.tl_canonical_subscription_id !== subscriptionId
      || subscription.metadata?.tl_provider_mode !== "live_canary"
      || subscription.metadata?.tl_canary_authorization_id !== this.config.authorizationId
    ) {
      providerError("CANARY_PROVIDER_OWNERSHIP_MISMATCH", "Stripe subscription lacks exact live-canary ownership evidence.");
    }
  }

  async retrieveSubscription(externalSubscriptionId: string) {
    await this.verifyAccountContext();
    try {
      const subscription = await this.stripe.subscriptions.retrieve(externalSubscriptionId, { expand: ["items.data.price"] });
      assertLiveModeObject(subscription, "Subscription");
      return normalizeCanonicalStripeSubscription(subscription, this.config.minorUnitExponent).subscription;
    } catch (caught) {
      if ((caught as { code?: string })?.code === "resource_missing") return null;
      throw caught;
    }
  }

  async retrieveCheckoutSession(sessionId: string, operationKey: string, subscriptionId: string) {
    await this.verifyAccountContext();
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (
      session.metadata?.tl_canonical_operation_key !== operationKey
      || session.metadata?.tl_canonical_subscription_id !== subscriptionId
    ) providerError("CANARY_PROVIDER_OWNERSHIP_MISMATCH", "Checkout Session does not match the exact canary operation.");
    return liveCheckoutSessionResult(session, this.config);
  }

  async recoverActivation(operationKey: string, subscriptionId: string) {
    await this.verifyAccountContext();
    const sessions = await this.stripe.checkout.sessions.list({ limit: 100 });
    const session = sessions.data.find((candidate) =>
      candidate.metadata?.tl_canonical_operation_key === operationKey
      && candidate.metadata?.tl_canonical_subscription_id === subscriptionId
      && candidate.metadata?.tl_provider_mode === "live_canary"
      && candidate.metadata?.tl_canary_authorization_id === this.config.authorizationId);
    return session ? liveCheckoutSessionResult(session, this.config) : null;
  }

  async createActivationCheckout(proposal: CanonicalStripeOperationProposal, idempotencyKey: string) {
    this.assertAuthorizedMutation({ operation: "activate_subscription", proposal });
    const attempt = this.assertActivationIdempotencyKey(idempotencyKey);
    if (attempt === "replacement") {
      const prior = await this.recoverActivation(proposal.operationKey, proposal.subscriptionId);
      if (!prior || prior.status !== "expired") {
        providerError("CANARY_REPLACEMENT_NOT_AUTHORIZED", "A replacement Checkout Session is allowed only after the approved session has expired.");
      }
    }
    await this.verifyAccountContext();
    if (proposal.kind !== "activation" || proposal.billingIntervalMonths !== 1 || proposal.currency !== LIVE_CANARY_CURRENCY) {
      providerError("CANARY_PROPOSAL_NOT_AUTHORIZED", "Only the approved monthly XCD activation may reach live Stripe.");
    }
    const total = proposal.rateGroups.reduce(
      (sum, group) => sum.plus(new Prisma.Decimal(group.agreedAmountPerCycle).times(group.quantity)),
      new Prisma.Decimal(0),
    );
    if (!total.equals(proposal.expectedRecurringTotal) || total.greaterThan(LIVE_CANARY_MAX_RECURRING_AMOUNT)) {
      providerError("CANARY_CHARGE_CAP_EXCEEDED", "The live Stripe request exceeds the approved canary total.");
    }
    const [customer, ...prices] = await Promise.all([
      this.ensureCustomer(proposal.customerId),
      ...proposal.rateGroups.map((group) => this.ensurePrice(group)),
    ]);
    const metadata: Stripe.MetadataParam = {
      tl_canonical_operation_key: metadataValue(proposal.operationKey),
      tl_canonical_subscription_id: metadataValue(proposal.subscriptionId),
      tl_customer_id: metadataValue(proposal.customerId),
      tl_provider_mode: "live_canary",
      tl_canary_authorization_id: metadataValue(this.config.authorizationId),
    };
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: proposal.subscriptionId,
      line_items: proposal.rateGroups.map((group, index) => ({ price: prices[index].id, quantity: group.quantity })),
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
      metadata,
      subscription_data: {
        billing_cycle_anchor: Math.floor(proposal.nextBillingDate.getTime() / 1000),
        proration_behavior: "none",
        metadata,
      },
    }, { idempotencyKey });
    return liveCheckoutSessionResult(session, this.config);
  }

  async expireCheckoutSession(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStripeCheckoutSession> {
    void sessionId;
    void idempotencyKey;
    providerError("CANARY_OPERATION_NOT_AUTHORIZED", "Checkout Session expiry is not an owner-authorized live-canary operation.");
  }

  async recoverSynchronization(operationKey: string, externalSubscriptionId: string) {
    await this.verifyAccountContext();
    const subscription = await this.stripe.subscriptions.retrieve(externalSubscriptionId, { expand: ["items.data.price"] });
    assertLiveModeObject(subscription, "Subscription");
    if (subscription.metadata?.tl_canonical_last_operation_key !== operationKey) return null;
    return normalizeCanonicalStripeSubscription(subscription, this.config.minorUnitExponent);
  }

  async synchronizeSubscription(proposal: CanonicalStripeOperationProposal, idempotencyKey: string) {
    this.assertAuthorizedMutation({ operation: "activate_subscription", proposal });
    await this.verifyAccountContext();
    const externalSubscriptionId = proposal.externalSubscriptionId;
    if (!externalSubscriptionId) providerError("CANARY_PROVIDER_SUBSCRIPTION_REQUIRED", "Synchronization requires a Stripe subscription ID.");
    const current = await this.stripe.subscriptions.retrieve(externalSubscriptionId, { expand: ["items.data.price"] });
    this.assertSubscriptionOwnership(current, proposal.subscriptionId);
    const originalAnchor = current.billing_cycle_anchor;
    const groups = new Map(proposal.rateGroups.map((group) => [group.fingerprint, group]));
    const priceEntries = await Promise.all(proposal.actions
      .filter((action) => action.kind === "create_rate_group" || action.kind === "replace_price")
      .map(async (action) => {
        const group = groups.get(action.fingerprint);
        if (!group) providerError("CANARY_RATE_GROUP_MISSING", "Approved synchronization action has no rate group.");
        return [action.fingerprint, await this.ensurePrice(group)] as const;
      }));
    const prices = new Map(priceEntries);
    const items: Stripe.SubscriptionUpdateParams.Item[] = proposal.actions.map((action) => {
      if (action.kind === "retire_rate_group") {
        if (!action.externalSubscriptionItemId) providerError("CANARY_PROVIDER_ITEM_REQUIRED", "Retirement requires a Stripe item ID.");
        return { id: action.externalSubscriptionItemId, deleted: true };
      }
      if (action.kind === "update_quantity") {
        if (!action.externalSubscriptionItemId) providerError("CANARY_PROVIDER_ITEM_REQUIRED", "Quantity update requires a Stripe item ID.");
        return { id: action.externalSubscriptionItemId, quantity: action.toQuantity };
      }
      const price = prices.get(action.fingerprint);
      if (!price) providerError("CANARY_PROVIDER_PRICE_REQUIRED", "A verified Stripe Price is required.");
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
        tl_provider_mode: "live_canary",
        tl_canary_authorization_id: metadataValue(this.config.authorizationId),
      },
      expand: ["items.data.price"],
    }, { idempotencyKey });
    this.assertSubscriptionOwnership(updated, proposal.subscriptionId);
    if (updated.billing_cycle_anchor !== originalAnchor) providerError("CANARY_BILLING_ANCHOR_CHANGED", "Stripe changed the renewal anchor.");
    const result = normalizeCanonicalStripeSubscription(updated, this.config.minorUnitExponent);
    const reconciliation = reconcileCanonicalStripeTestProviderResult({ proposal, result });
    if (reconciliation.status !== "matched") {
      providerError("CANARY_POST_PROVIDER_RECONCILIATION_FAILED", reconciliation.differences[0]?.explanation ?? "Provider state differs.");
    }
    return result;
  }

  async scheduleCancellationAtPeriodEnd(input: {
    externalSubscriptionId: string;
    canonicalSubscriptionId: string;
    idempotencyKey: string;
  }): Promise<{ externalSubscriptionId: string; cancelAtPeriodEnd: true; currentPeriodEnd: Date | null }> {
    this.assertAuthorizedMutation({
      operation: "cancel_subscription_at_period_end",
      externalSubscriptionId: input.externalSubscriptionId,
    });
    const expectedIdempotencyKey = `tl-canonical-live-canary-cancel:${this.config.authorizationId}`;
    if (input.idempotencyKey !== expectedIdempotencyKey) {
      providerError("CANARY_IDEMPOTENCY_KEY_MISMATCH", "Cancellation idempotency is not bound to the signed owner authorization.");
    }
    await this.verifyAccountContext();
    const current = await this.stripe.subscriptions.retrieve(input.externalSubscriptionId);
    this.assertSubscriptionOwnership(current, input.canonicalSubscriptionId);
    const originalAnchor = current.billing_cycle_anchor;
    const updated = await this.stripe.subscriptions.update(input.externalSubscriptionId, {
      cancel_at_period_end: true,
      proration_behavior: "none",
    }, { idempotencyKey: input.idempotencyKey });
    this.assertSubscriptionOwnership(updated, input.canonicalSubscriptionId);
    if (updated.billing_cycle_anchor !== originalAnchor || !updated.cancel_at_period_end) {
      providerError("CANARY_CANCELLATION_NOT_CONFIRMED", "Stripe did not preserve the anchor and confirm end-of-period cancellation.");
    }
    return {
      externalSubscriptionId: updated.id,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: updated.current_period_end ? new Date(updated.current_period_end * 1000) : null,
    };
  }

  async retrieveInvoices(externalSubscriptionId: string): Promise<CanonicalStripeProviderInvoice[]> {
    await this.verifyAccountContext();
    const invoices = await this.stripe.invoices.list({ subscription: externalSubscriptionId, limit: 100, expand: ["data.payment_intent"] });
    return invoices.data.map((invoice) => {
      assertLiveModeObject(invoice, "Invoice");
      const starts = invoice.lines.data.map((line) => line.period?.start).filter((value): value is number => value != null);
      const ends = invoice.lines.data.map((line) => line.period?.end).filter((value): value is number => value != null);
      const paymentIntent = invoice.payment_intent;
      return {
        id: invoice.id,
        status: invoice.status ?? "unknown",
        currency: invoice.currency.toUpperCase(),
        total: new Prisma.Decimal(invoice.total ?? invoice.amount_due ?? 0).dividedBy(100).toFixed(2),
        amountPaid: new Prisma.Decimal(invoice.amount_paid).dividedBy(100).toFixed(2),
        paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
        periodStart: starts.length ? new Date(Math.min(...starts) * 1000) : null,
        periodEnd: ends.length ? new Date(Math.max(...ends) * 1000) : null,
      };
    });
  }

  async retrievePayment(paymentIntentId: string): Promise<CanonicalStripeProviderPayment> {
    await this.verifyAccountContext();
    const payment = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    assertLiveModeObject(payment, "PaymentIntent");
    const invoice = (payment as Stripe.PaymentIntent & { invoice?: string | Stripe.Invoice | null }).invoice;
    return {
      id: payment.id,
      status: payment.status,
      currency: payment.currency.toUpperCase(),
      amount: new Prisma.Decimal(payment.amount).dividedBy(100).toFixed(2),
      invoiceId: typeof invoice === "string" ? invoice : invoice?.id ?? null,
    };
  }
}

export function createStripeLiveCanaryCanonicalProviderAdapter(input: {
  authorization: CanonicalStripeLiveCanaryAuthorization;
  proposal: CanonicalStripeOperationProposal;
  environment?: CanonicalStripeLiveCanaryEnvironment;
}): StripeLiveCanaryCanonicalProviderAdapter {
  const environment = input.environment ?? process.env;
  const config = canonicalStripeLiveCanaryProviderConfig({
    authorization: input.authorization,
    proposal: input.proposal,
    environment,
  });
  const stripe = new Stripe(liveSecretKey(environment), {
    apiVersion: CANONICAL_STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 30_000,
  });
  return new StripeLiveCanaryCanonicalProviderAdapter(stripe, config);
}
