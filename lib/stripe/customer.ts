import "server-only";

import type { Customer } from "@prisma/client";

import { prisma } from "@/lib/db";

import { getStripeClient } from "./config";

function stripeCustomerName(c: Customer): string | undefined {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return person || undefined;
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
    return { stripeCustomerId: existing.externalCustomerId };
  }

  const email = customer.email?.trim();
  if (!email) {
    throw new Error("Customer needs an email address before starting Stripe Checkout.");
  }

  const created = await stripe.customers.create({
    email,
    name: stripeCustomerName(customer),
    phone: customer.phone?.trim() || undefined,
    metadata: {
      tl_customer_id: customer.id,
    },
  });

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
