import "server-only";

import { prisma } from "@/lib/db";
import { opsUrgencyFromNextDueDate } from "@/lib/admin/assignment-ops-urgency";
import {
  billableAssignmentWhere,
  stripeTrackAssignmentWhere,
} from "@/lib/domain/service-assignment-queries";
import { getCurrentCustomerSubscription } from "@/lib/services/customer-subscription-service";
import { advanceAssignmentsOnStripeInvoicePaid } from "@/lib/services/assignment-renewal-service";
import { getStripeClient, isStripeBillingEnabled } from "@/lib/stripe/config";
import {
  resolveStripeCustomerIdForTlCustomer,
  syncStripeInvoiceToDatabase,
} from "@/lib/stripe/invoice-sync";

export type ApplyLatestPaidStripeInvoiceResult =
  | {
      ok: true;
      advanced: number;
      skipped: number;
      invoiceId: string;
      reason?: string;
    }
  | { ok: false; error: string };

/**
 * Advance Stripe-track device due dates from the latest paid Stripe invoice.
 * Used when `invoice.paid` was missed and as a staff catch-up (does not charge).
 */
export async function applyLatestPaidStripeInvoiceToRenewals(
  customerId: string,
): Promise<ApplyLatestPaidStripeInvoiceResult> {
  if (!isStripeBillingEnabled()) {
    return { ok: false, error: "Stripe billing is not enabled." };
  }

  const stripeInvoiceId = await resolveLatestPaidStripeInvoiceId(customerId);
  if (!stripeInvoiceId) {
    return { ok: false, error: "No paid Stripe invoice found for this customer." };
  }

  const result = await advanceAssignmentsOnStripeInvoicePaid(customerId, stripeInvoiceId);
  return {
    ok: true,
    invoiceId: stripeInvoiceId,
    ...result,
  };
}

/**
 * If Stripe-track (or whole-fleet unset-term) devices are overdue, apply the
 * latest paid invoice. Cheap no-op when dates are already current.
 */
export async function catchUpOverdueRenewalsFromLatestPaidInvoice(
  customerId: string,
): Promise<{ advanced: number; skipped: number } | null> {
  if (!isStripeBillingEnabled() || !(await customerNeedsStripeRenewalCatchUp(customerId))) {
    return null;
  }
  const result = await applyLatestPaidStripeInvoiceToRenewals(customerId);
  if (!result.ok) {
    console.error("[stripe renewal catch-up]", result.error, { customerId });
    return null;
  }
  return { advanced: result.advanced, skipped: result.skipped };
}

async function customerNeedsStripeRenewalCatchUp(customerId: string): Promise<boolean> {
  const sub = await getCurrentCustomerSubscription(customerId);
  const planTermMonths = sub?.planTermMonths;
  if (planTermMonths == null || planTermMonths <= 0) return false;

  const stripeTrack = await prisma.serviceAssignment.findMany({
    where: { customerId, ...stripeTrackAssignmentWhere(planTermMonths) },
    select: { nextDueDate: true },
  });
  const now = new Date();
  if (stripeTrack.some((a) => opsUrgencyFromNextDueDate(a.nextDueDate, now) === "overdue")) {
    return true;
  }

  const billable = await prisma.serviceAssignment.findMany({
    where: { customerId, ...billableAssignmentWhere },
    select: { intervalMonths: true, nextDueDate: true },
  });
  if (billable.length === 0) return false;
  const allUnset = billable.every((a) => a.intervalMonths == null);
  if (!allUnset) return false;
  return billable.some((a) => opsUrgencyFromNextDueDate(a.nextDueDate, now) === "overdue");
}

async function resolveLatestPaidStripeInvoiceId(customerId: string): Promise<string | null> {
  const stripeCustomerId = await resolveStripeCustomerIdForTlCustomer(customerId);
  if (stripeCustomerId) {
    try {
      const stripe = getStripeClient();
      const listed = await stripe.invoices.list({
        customer: stripeCustomerId,
        status: "paid",
        limit: 1,
      });
      const fromCustomer = listed.data[0];
      if (fromCustomer?.id) {
        await syncStripeInvoiceToDatabase(fromCustomer);
        return fromCustomer.id;
      }
    } catch (e) {
      console.error("[stripe renewal catch-up] list invoices by customer failed", e);
    }
  }

  const mirrored = await prisma.billingInvoice.findFirst({
    where: {
      customerId,
      provider: "stripe",
      status: { equals: "paid", mode: "insensitive" },
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: { externalInvoiceId: true },
  });
  if (mirrored?.externalInvoiceId) return mirrored.externalInvoiceId;

  const sub = await getCurrentCustomerSubscription(customerId);
  const stripeSubscriptionId = sub?.stripeSubscriptionId?.trim() || null;
  if (!stripeSubscriptionId) return null;

  const stripe = getStripeClient();
  const listed = await stripe.invoices.list({
    subscription: stripeSubscriptionId,
    status: "paid",
    limit: 1,
  });
  const fromList = listed.data[0];
  if (fromList?.id) {
    await syncStripeInvoiceToDatabase(fromList);
    return fromList.id;
  }

  const live = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const latestRef = live.latest_invoice;
  const latestId = typeof latestRef === "string" ? latestRef : latestRef?.id;
  if (!latestId) return null;
  const invoice = await stripe.invoices.retrieve(latestId);
  if (invoice.status !== "paid") return null;
  await syncStripeInvoiceToDatabase(invoice);
  return invoice.id;
}
