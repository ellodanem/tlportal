import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import {
  CARD_ON_FILE_PROVIDER_MODE,
  cardOnFileDelayedChargeParams,
} from "@/lib/domain/canonical-stripe-card-on-file";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import {
  canonicalStripeRateGroupFingerprint,
  stripePriceMajorAmount,
  stripeRecurringIntervalMonths,
} from "@/lib/stripe/canonical-provider-normalization";
import { getStripeClient } from "@/lib/stripe/config";

const MINOR_UNIT_EXPONENT = 2;

export type CardOnFileRateGroup = {
  fingerprint: string;
  currency: string;
  billingIntervalMonths: number;
  agreedAmountPerCycle: string;
  quantity: number;
};

function metadataValue(value: string): string {
  return value.slice(0, 500);
}

function priceLookupKey(fingerprint: string): string {
  return `tl_card_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 40)}`;
}

function recurringParameters(months: number): Stripe.PriceCreateParams.Recurring {
  if (months === 12) return { interval: "year", interval_count: 1 };
  if ([1, 3, 4, 6].includes(months)) return { interval: "month", interval_count: months };
  throw new Error(`Stripe card-on-file Checkout does not support a ${months}-month interval.`);
}

function majorAmountToMinor(amount: string): number {
  const minor = new Prisma.Decimal(amount).times(new Prisma.Decimal(10).pow(MINOR_UNIT_EXPONENT));
  if (!minor.isInteger() || minor.isNegative()) {
    throw new Error("The agreed recurring amount cannot be sent to Stripe exactly.");
  }
  return minor.toNumber();
}

function priceCompatible(price: Stripe.Price, group: CardOnFileRateGroup): boolean {
  if (!price.active || price.type !== "recurring") return false;
  if (price.metadata?.tl_rate_group_fingerprint !== group.fingerprint) return false;
  if (price.metadata?.tl_provider_mode !== CARD_ON_FILE_PROVIDER_MODE) return false;
  if (price.currency.toUpperCase() !== group.currency.toUpperCase()) return false;
  if (stripeRecurringIntervalMonths(price) !== group.billingIntervalMonths) return false;
  const amount = stripePriceMajorAmount(price, MINOR_UNIT_EXPONENT);
  return amount != null && new Prisma.Decimal(amount).equals(group.agreedAmountPerCycle);
}

export function cardOnFileCheckoutMetadata(input: {
  operationKey: string;
  subscriptionId: string;
  customerId: string;
}): Stripe.MetadataParam {
  return {
    tl_canonical_subscription_id: metadataValue(input.subscriptionId),
    tl_customer_id: metadataValue(input.customerId),
    tl_card_on_file_operation_key: metadataValue(input.operationKey),
    tl_provider_mode: CARD_ON_FILE_PROVIDER_MODE,
  };
}

export async function ensureCardOnFilePrices(groups: CardOnFileRateGroup[]): Promise<Stripe.Price[]> {
  const stripe = getStripeClient();
  return Promise.all(groups.map(async (group) => {
    const lookupKey = priceLookupKey(group.fingerprint);
    const existing = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 10 });
    if (existing.data.length > 1) {
      throw new Error("More than one Stripe Price exists for the same card-on-file rate.");
    }
    if (existing.data[0]) {
      if (!priceCompatible(existing.data[0], group)) {
        throw new Error("An existing Stripe Price does not match this subscription's recurring amount.");
      }
      return existing.data[0];
    }
    const created = await stripe.prices.create({
      currency: group.currency.toLowerCase(),
      unit_amount: majorAmountToMinor(group.agreedAmountPerCycle),
      recurring: recurringParameters(group.billingIntervalMonths),
      lookup_key: lookupKey,
      nickname: `TL card-on-file ${group.billingIntervalMonths}-month`,
      product_data: {
        name: "Track Lucia GPS tracking",
        metadata: { tl_provider_mode: CARD_ON_FILE_PROVIDER_MODE },
      },
      metadata: {
        tl_rate_group_fingerprint: metadataValue(group.fingerprint),
        tl_billing_interval_months: String(group.billingIntervalMonths),
        tl_agreed_amount_per_cycle: group.agreedAmountPerCycle,
        tl_provider_mode: CARD_ON_FILE_PROVIDER_MODE,
      },
    }, { idempotencyKey: `tl-card-on-file-price:${lookupKey}` });
    if (!priceCompatible(created, group)) {
      throw new Error("Stripe created a Price that does not match the agreed recurring amount.");
    }
    return created;
  }));
}

export async function createCardOnFileCheckout(input: {
  stripeCustomerId: string;
  operationKey: string;
  subscriptionId: string;
  customerId: string;
  nextBillingDate: Date;
  groups: CardOnFileRateGroup[];
  idempotencyKey: string;
}): Promise<{ id: string; url: string; status: string }> {
  const stripe = getStripeClient();
  const prices = await ensureCardOnFilePrices(input.groups);
  const metadata = cardOnFileCheckoutMetadata(input);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.stripeCustomerId,
    client_reference_id: input.subscriptionId,
    payment_method_collection: "always",
    line_items: input.groups.map((group, index) => ({ price: prices[index]!.id, quantity: group.quantity })),
    success_url: `${getAppBaseUrl()}/pay/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppBaseUrl()}/pay/cancel`,
    metadata,
    subscription_data: {
      ...cardOnFileDelayedChargeParams(input.nextBillingDate),
      metadata,
    },
  }, { idempotencyKey: input.idempotencyKey });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { id: session.id, url: session.url, status: session.status ?? "open" };
}

export function cardOnFileRateGroupFingerprintFromItem(item: Stripe.SubscriptionItem): string | null {
  return canonicalStripeRateGroupFingerprint(item);
}

export async function expireCheckoutSessionIfOpen(sessionId: string): Promise<void> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.status === "open") {
    await stripe.checkout.sessions.expire(sessionId);
  }
}

export async function cancelStripeSubscriptionImmediately(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  if (current.status === "canceled" || current.status === "incomplete_expired") return;
  await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
}

export async function voidOpenStripeInvoice(invoiceId: string): Promise<void> {
  const stripe = getStripeClient();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.status === "void" || invoice.status === "paid") return;
  if (invoice.status === "open" || invoice.status === "uncollectible") {
    await stripe.invoices.voidInvoice(invoiceId);
  }
}
