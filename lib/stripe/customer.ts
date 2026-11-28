import "server-only";

import type { Customer } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";

import { getStripeClient, isStripeBillingEnabled } from "./config";

export type StripeCustomerContactFields = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
};

function stripeCustomerName(c: StripeCustomerContactFields): string | undefined {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return person || undefined;
}

function stripeContactPatch(
  current: Pick<Stripe.Customer, "email" | "phone" | "name">,
  customer: StripeCustomerContactFields,
): Stripe.CustomerUpdateParams {
  const email = customer.email?.trim() || undefined;
  const phone = customer.phone?.trim() || "";
  const name = stripeCustomerName(customer);
  const patch: Stripe.CustomerUpdateParams = {};
  if (email && current.email !== email) patch.email = email;
  if ((current.phone ?? "") !== phone) patch.phone = phone;
  if (name && current.name !== name) patch.name = name;
  return patch;
}

async function applyStripeCustomerContact(
  stripeCustomerId: string,
  customer: StripeCustomerContactFields,
): Promise<void> {
  const stripe = getStripeClient();
  const current = await stripe.customers.retrieve(stripeCustomerId);
  if ("deleted" in current && current.deleted) return;
  const patch = stripeContactPatch(current, customer);
  if (Object.keys(patch).length === 0) return;
  await stripe.customers.update(stripeCustomerId, patch);
}

/**
 * Copy TL Portal email, phone, and name onto an existing Stripe customer.
 * Does not create a Stripe customer. Save in TL Portal still succeeds if Stripe is down.
 */
export async function syncLinkedStripeCustomerContact(
  customer: StripeCustomerContactFields,
): Promise<{ updated: boolean }> {
  if (!isStripeBillingEnabled()) return { updated: false };
  const existing = await prisma.billingAccount.findUnique({
    where: {
      customerId_provider: { customerId: customer.id, provider: "stripe" },
    },
    select: { externalCustomerId: true },
  });
  if (!existing?.externalCustomerId) return { updated: false };
  try {
    await applyStripeCustomerContact(existing.externalCustomerId, customer);
    return { updated: true };
  } catch (err) {
    console.error("Stripe customer contact sync failed", err);
    return { updated: false };
  }
}

export async function ensureStripeCustomerForTlCustomer(
  customer: Customer,
): Promise<{ stripeCustomerId: string }> {
  const stripe = getStripeClient();

  const existing = await prisma.billingAccount.findUnique({
    where: {
      customerId_provider: { customerId: customer.id, provider: "stripe" },
    },
    select: { externalCustomerId: true },
  });
  if (existing?.externalCustomerId) {
    try {
      await applyStripeCustomerContact(existing.externalCustomerId, customer);
    } catch {
      // Keep using the known Stripe customer even if contact details could not be refreshed.
    }
    return { stripeCustomerId: existing.externalCustomerId };
  }

  const email = customer.email?.trim();
  if (!email) {
    throw new Error("Customer needs an email address before starting Stripe Checkout.");
  }

  // Recover a provider customer when Stripe succeeded but the local upsert did
  // not complete. Metadata is the stable reconciliation key; email alone is
  // not sufficient because addresses can be shared or changed.
  const candidates = await stripe.customers.list({ email, limit: 100 });
  const recovered = candidates.data.find(
    (candidate) => !candidate.deleted && candidate.metadata?.tl_customer_id === customer.id,
  );

  const created = recovered ?? await stripe.customers.create(
    {
      email,
      name: stripeCustomerName(customer),
      phone: customer.phone?.trim() || undefined,
      metadata: {
        tl_customer_id: customer.id,
      },
    },
    { idempotencyKey: `tl-customer:${customer.id}` },
  );

  if (recovered) {
    try {
      await applyStripeCustomerContact(created.id, customer);
    } catch {
      // Recovered customer is still usable even if contact details could not be refreshed.
    }
  }

  await prisma.billingAccount.upsert({
    where: {
      customerId_provider: { customerId: customer.id, provider: "stripe" },
    },
    create: {
      customerId: customer.id,
      provider: "stripe",
      externalCustomerId: created.id,
      mode: "stripe_subscription",
    },
    update: {
      externalCustomerId: created.id,
    },
  });

  return { stripeCustomerId: created.id };
}
