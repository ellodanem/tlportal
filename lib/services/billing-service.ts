import "server-only";

import { Prisma, type BillingProvider, type CustomerBillingMode } from "@prisma/client";

import { invoilessBillingAdapter } from "@/lib/adapters/billing/invoiless/adapter";
import { stripeBillingAdapter } from "@/lib/adapters/billing/stripe/adapter";
import { prisma } from "@/lib/db";
import { parseStripeBillingMetadata } from "@/lib/stripe/metadata";
import { createStripeSubscriptionCheckout } from "@/lib/stripe/checkout";
import { createStripeBillingPortalSession } from "@/lib/stripe/portal";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import type { BillingPort } from "@/lib/ports/billing";

import { createPendingCustomerSubscription } from "./customer-subscription-service";
import { recordOperationalEvent } from "./operational-event-service";

function billingAdapterFor(provider: BillingProvider): BillingPort {
  switch (provider) {
    case "invoiless":
      return invoilessBillingAdapter;
    case "stripe":
      return stripeBillingAdapter;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export async function getBillingAccounts(customerId: string) {
  return prisma.billingAccount.findMany({
    where: { customerId },
    orderBy: { provider: "asc" },
  });
}

export async function getInvoilessExternalCustomerId(customerId: string): Promise<string | null> {
  const account = await prisma.billingAccount.findUnique({
    where: {
      customerId_provider: { customerId, provider: "invoiless" },
    },
    select: { externalCustomerId: true },
  });
  if (account?.externalCustomerId) {
    return account.externalCustomerId;
  }
  const legacy = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { invoilessCustomerId: true },
  });
  return legacy?.invoilessCustomerId ?? null;
}

export async function findTlCustomerIdByInvoilessExternalId(
  invoilessCustomerId: string,
): Promise<string | null> {
  const id = invoilessCustomerId.trim();
  if (!id) return null;

  const account = await prisma.billingAccount.findUnique({
    where: {
      provider_externalCustomerId: {
        provider: "invoiless",
        externalCustomerId: id,
      },
    },
    select: { customerId: true },
  });
  if (account) return account.customerId;

  const legacy = await prisma.customer.findFirst({
    where: { invoilessCustomerId: id },
    select: { id: true },
  });
  return legacy?.id ?? null;
}

export async function setCustomerStripeMonthlyRate(
  customerId: string,
  monthlyRateXcd: number | null,
  actorUserId?: string | null,
): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      stripeMonthlyRateXcd:
        monthlyRateXcd == null ? null : new Prisma.Decimal(monthlyRateXcd),
    },
  });
  await recordOperationalEvent({
    category: "billing.mode_changed",
    summary:
      monthlyRateXcd == null
        ? "Stripe monthly rate reset to default catalog"
        : `Stripe monthly rate set to ${monthlyRateXcd} XCD`,
    customerId,
    actorUserId: actorUserId ?? undefined,
    payload: { monthlyRateXcd },
  });
}

export async function setCustomerBillingMode(
  customerId: string,
  mode: CustomerBillingMode,
  actorUserId?: string | null,
): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: { billingMode: mode },
  });
  await recordOperationalEvent({
    category: "billing.mode_changed",
    summary: `Billing mode set to ${mode}`,
    customerId,
    actorUserId: actorUserId ?? undefined,
    payload: { mode },
  });
}

/**
 * Push customer to Invoiless and upsert BillingAccount (keeps legacy invoilessCustomerId in sync).
 */
export async function syncCustomerToInvoilessBilling(
  customerId: string,
  actorUserId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adapter = invoilessBillingAdapter;
  if (!adapter.isConfigured()) {
    return { ok: false, error: "INVOILESS_API_KEY is not set." };
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { ok: false, error: "Customer not found." };
  }

  try {
    const { externalCustomerId } = await adapter.ensureCustomer({
      tlCustomerId: customerId,
      customer,
    });

    await prisma.$transaction([
      prisma.billingAccount.upsert({
        where: {
          customerId_provider: { customerId, provider: "invoiless" },
        },
        create: {
          customerId,
          provider: "invoiless",
          externalCustomerId,
          mode: "manual_legacy",
        },
        update: {
          externalCustomerId,
        },
      }),
      prisma.customer.update({
        where: { id: customerId },
        data: { invoilessCustomerId: externalCustomerId },
      }),
    ]);

    await recordOperationalEvent({
      category: "billing.synced",
      summary: "Customer synced to Invoiless",
      customerId,
      actorUserId: actorUserId ?? undefined,
      payload: { provider: "invoiless", externalCustomerId },
    });

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    return { ok: false, error: message };
  }
}

export async function getStripeBillingAccount(customerId: string) {
  return prisma.billingAccount.findUnique({
    where: {
      customerId_provider: { customerId, provider: "stripe" },
    },
  });
}

export function isStripeConfigured(): boolean {
  return isStripeBillingEnabled();
}

export async function startStripeCheckout(
  customerId: string,
  durationMonths: number,
  actorUserId?: string | null,
  options?: {
    monthlyRateXcd?: number | null;
    vehicleCount?: number;
    useCustomPricing?: boolean;
  },
): Promise<
  { ok: true; url: string; sessionId: string; pricingMode: string } | { ok: false; error: string }
> {
  if (!isStripeBillingEnabled()) {
    return { ok: false, error: "Stripe billing is not enabled." };
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { ok: false, error: "Customer not found." };
  }

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: { billingMode: "stripe_subscription" },
    });
    const vehicleCount = Math.max(1, options?.vehicleCount ?? 1);
    const monthlyRateXcd = options?.monthlyRateXcd ?? null;
    const { id: tlSubscriptionId } = await createPendingCustomerSubscription({
      customerId,
      planTermMonths: durationMonths,
      monthlyRateXcd,
      vehicleCount,
    });
    const { url, sessionId, pricingMode } = await createStripeSubscriptionCheckout({
      customer,
      durationMonths,
      tlSubscriptionId,
      monthlyRateXcd,
      vehicleCount,
      useCustomPricing: options?.useCustomPricing,
    });
    await recordOperationalEvent({
      category: "billing.synced",
      summary: `Stripe Checkout started (${durationMonths} mo, ${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"}, ${pricingMode})`,
      customerId,
      actorUserId: actorUserId ?? undefined,
      payload: {
        durationMonths,
        monthlyRateXcd,
        vehicleCount,
        pricingMode,
        checkoutSessionId: sessionId,
      },
    });
    return { ok: true, url, sessionId, pricingMode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed." };
  }
}

export async function openStripeBillingPortal(
  customerId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isStripeBillingEnabled()) {
    return { ok: false, error: "Stripe billing is not enabled." };
  }

  try {
    const { url } = await createStripeBillingPortalSession(customerId);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Portal session failed." };
  }
}

export function formatStripeBillingSummary(account: {
  status: string | null;
  externalCustomerId: string;
  metadata: unknown;
}): string {
  const meta = parseStripeBillingMetadata(account.metadata);
  const parts = [`Stripe · ${account.status ?? "—"}`, account.externalCustomerId];
  if (meta.currentPeriodEnd) {
    parts.push(`renews ${new Date(meta.currentPeriodEnd).toLocaleDateString()}`);
  }
  return parts.join(" · ");
}

export { billingAdapterFor };
