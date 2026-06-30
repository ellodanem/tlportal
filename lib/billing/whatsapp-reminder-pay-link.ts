import "server-only";

import type { Customer, CustomerSubscription } from "@prisma/client";

import { invoilessInvoicePreviewUrl } from "@/lib/invoiless/preview-url";
import { prisma } from "@/lib/db";
import { isInvoilessLegacyUiEnabled } from "@/lib/domain/native-billing-cutover";
import { isStripeConfigured } from "@/lib/services/billing-service";
import { getCurrentCustomerSubscription } from "@/lib/services/customer-subscription-service";
import { createStripeSubscriptionCheckout } from "@/lib/stripe/checkout";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import { monthlyRateFromCustomer } from "@/lib/stripe/checkout-pricing";

export type PayLinkResolution =
  | { url: string; source: string }
  | { url: null; source: "none" };

const OPEN_STRIPE_INVOICE_STATUSES = ["open", "draft", "uncollectible"] as const;

function isInvoilessInvoiceRef(ref: string): boolean {
  const t = ref.trim();
  if (!t) return false;
  if (t.startsWith("in_")) return false;
  return true;
}

/** Latest open Stripe hosted invoice URL mirrored in TL. */
async function openStripeHostedInvoiceUrl(customerId: string): Promise<string | null> {
  const row = await prisma.billingInvoice.findFirst({
    where: {
      customerId,
      provider: "stripe",
      hostedInvoiceUrl: { not: null },
      status: { in: [...OPEN_STRIPE_INVOICE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { hostedInvoiceUrl: true },
  });
  return row?.hostedInvoiceUrl?.trim() || null;
}

/** Latest open native TL invoice public pay link. */
async function nativeInvoicePayUrl(customerId: string): Promise<string | null> {
  const inv = await prisma.invoice.findFirst({
    where: {
      customerId,
      status: { in: ["open", "partially_paid", "overdue"] },
      amountDue: { gt: 0 },
      publicToken: { not: null },
    },
    orderBy: { issueDate: "desc" },
    select: { publicToken: true },
  });
  const token = inv?.publicToken?.trim();
  if (!token) return null;
  return `${getAppBaseUrl()}/pay/i/${token}`;
}

/** Invoiless public preview from assignment or mirrored invoice row. */
async function invoilessPayUrl(customerId: string): Promise<string | null> {
  if (!isInvoilessLegacyUiEnabled()) {
    return null;
  }
  const mirror = await prisma.billingInvoice.findFirst({
    where: {
      customerId,
      invoilessMirrorInvoiceId: { not: null },
      status: { not: "paid" },
    },
    orderBy: { createdAt: "desc" },
    select: { invoilessMirrorInvoiceId: true },
  });
  if (mirror?.invoilessMirrorInvoiceId) {
    return invoilessInvoicePreviewUrl(mirror.invoilessMirrorInvoiceId);
  }

  const assignment = await prisma.serviceAssignment.findFirst({
    where: {
      customerId,
      endDate: null,
      status: { not: "cancelled" },
      lastInvoiceId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { lastInvoiceId: true },
  });
  const ref = assignment?.lastInvoiceId?.trim();
  if (ref && isInvoilessInvoiceRef(ref)) {
    return invoilessInvoicePreviewUrl(ref);
  }
  return null;
}

async function stripeCheckoutPayUrl(
  customer: Customer,
  sub: CustomerSubscription | null,
): Promise<string | null> {
  if (!isStripeConfigured() || customer.billingMode !== "stripe_subscription") {
    return null;
  }
  if (!sub || sub.status !== "pending_payment") {
    return null;
  }

  const activeCount = await prisma.serviceAssignment.count({
    where: { customerId: customer.id, endDate: null, status: { not: "cancelled" } },
  });
  const vehicleCount = Math.max(1, sub.vehicleCount ?? activeCount);
  const monthlyRateXcd = sub.monthlyRateXcd
    ? Number(sub.monthlyRateXcd)
    : monthlyRateFromCustomer(customer.stripeMonthlyRateXcd);

  try {
    const { url } = await createStripeSubscriptionCheckout({
      customer,
      durationMonths: sub.planTermMonths,
      tlSubscriptionId: sub.id,
      monthlyRateXcd,
      vehicleCount,
      useCustomPricing: monthlyRateXcd != null,
    });
    return url;
  } catch {
    return null;
  }
}

export async function resolveBillingReminderPayLink(customerId: string): Promise<PayLinkResolution> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { url: null, source: "none" };
  }

  const hosted = await openStripeHostedInvoiceUrl(customerId);
  if (hosted) {
    return { url: hosted, source: "stripe_hosted_invoice" };
  }

  const nativePay = await nativeInvoicePayUrl(customerId);
  if (nativePay) {
    return { url: nativePay, source: "native_invoice_pay" };
  }

  const invoiless = await invoilessPayUrl(customerId);
  if (invoiless) {
    return { url: invoiless, source: "invoiless_preview" };
  }

  const sub = await getCurrentCustomerSubscription(customer.id);
  const checkout = await stripeCheckoutPayUrl(customer, sub);
  if (checkout) {
    return { url: checkout, source: "stripe_checkout" };
  }

  return { url: null, source: "none" };
}
