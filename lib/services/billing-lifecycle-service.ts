import "server-only";

import type { CustomerBillingMode } from "@prisma/client";

import { prisma } from "@/lib/db";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import { ensureStripeCustomerForTlCustomer } from "@/lib/stripe/customer";

import {
  getInvoilessExternalCustomerId,
  getStripeBillingAccount,
  isStripeConfigured,
  setCustomerBillingMode,
  syncCustomerToInvoilessBilling,
} from "./billing-service";
import { recordOperationalEvent } from "./operational-event-service";

export type BillingSetupStatus = {
  billingMode: CustomerBillingMode;
  stripeConfigured: boolean;
  invoilessConfigured: boolean;
  hasStripeAccount: boolean;
  hasInvoilessAccount: boolean;
  needsSetup: boolean;
};

export async function getBillingSetupStatus(customerId: string): Promise<BillingSetupStatus | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { billingMode: true },
  });
  if (!customer) return null;

  const stripeConfigured = isStripeConfigured();
  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());
  const [stripeAccount, invoilessId] = await Promise.all([
    stripeConfigured ? getStripeBillingAccount(customerId) : Promise.resolve(null),
    getInvoilessExternalCustomerId(customerId),
  ]);

  const hasStripeAccount = Boolean(stripeAccount?.externalCustomerId);
  const hasInvoilessAccount = Boolean(invoilessId);

  const needsStripe =
    customer.billingMode === "stripe_subscription" && stripeConfigured && !hasStripeAccount;
  const needsInvoiless = invoilessConfigured && !hasInvoilessAccount;

  return {
    billingMode: customer.billingMode,
    stripeConfigured,
    invoilessConfigured,
    hasStripeAccount,
    hasInvoilessAccount,
    needsSetup: needsStripe || needsInvoiless,
  };
}

export type EnableBillingLifecycleInput = {
  customerId: string;
  mode: CustomerBillingMode;
  /** Create/link Stripe customer (requires email). Default true when mode is stripe_subscription. */
  syncStripe?: boolean;
  /** Push contact to Invoiless. Default true. */
  syncInvoiless?: boolean;
  actorUserId?: string | null;
};

export type EnableBillingLifecycleResult =
  | {
      ok: true;
      stripeCustomerId: string | null;
      invoilessCustomerId: string | null;
      warnings: string[];
    }
  | { ok: false; error: string };

/**
 * Phase 4: link billing providers without starting Checkout (staff sends payment link separately).
 */
export async function enableCustomerBillingLifecycle(
  input: EnableBillingLifecycleInput,
): Promise<EnableBillingLifecycleResult> {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) {
    return { ok: false, error: "Customer not found." };
  }

  const syncStripe =
    input.syncStripe ?? input.mode === "stripe_subscription";
  const syncInvoiless = input.syncInvoiless ?? true;
  const warnings: string[] = [];

  await setCustomerBillingMode(input.customerId, input.mode, input.actorUserId);

  let stripeCustomerId: string | null = null;
  let invoilessCustomerId: string | null = await getInvoilessExternalCustomerId(input.customerId);

  if (syncStripe && input.mode === "stripe_subscription") {
    if (!isStripeBillingEnabled()) {
      warnings.push("Stripe is not configured (STRIPE_SECRET_KEY).");
    } else if (!customer.email?.trim()) {
      warnings.push("Add an email on the customer profile before linking Stripe.");
    } else {
      try {
        const { stripeCustomerId: cusId } = await ensureStripeCustomerForTlCustomer(customer);
        stripeCustomerId = cusId;
        await recordOperationalEvent({
          category: "billing.synced",
          summary: "Stripe customer linked",
          customerId: input.customerId,
          actorUserId: input.actorUserId ?? undefined,
          payload: { provider: "stripe", externalCustomerId: cusId },
        });
      } catch (e) {
        warnings.push(e instanceof Error ? e.message : "Stripe link failed.");
      }
    }
  }

  if (syncInvoiless) {
    const invResult = await syncCustomerToInvoilessBilling(
      input.customerId,
      input.actorUserId ?? null,
    );
    if (invResult.ok) {
      invoilessCustomerId = await getInvoilessExternalCustomerId(input.customerId);
    } else if (invResult.error !== "INVOILESS_API_KEY is not set.") {
      warnings.push(invResult.error);
    }
  }

  if (warnings.length === 0 || stripeCustomerId || invoilessCustomerId) {
    await recordOperationalEvent({
      category: "billing.synced",
      summary: `Billing setup (${input.mode})`,
      customerId: input.customerId,
      actorUserId: input.actorUserId ?? undefined,
      payload: {
        mode: input.mode,
        stripeCustomerId,
        invoilessCustomerId,
        warnings,
      },
    });
    return { ok: true, stripeCustomerId, invoilessCustomerId, warnings };
  }

  return {
    ok: false,
    error: warnings.join(" ") || "Billing setup could not complete.",
  };
}
