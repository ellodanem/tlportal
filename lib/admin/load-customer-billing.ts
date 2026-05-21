import "server-only";

import { prisma } from "@/lib/db";
import {
  getDefaultMonthlyRateXcd,
  listStripeCheckoutPlanOptions,
  monthlyRateFromCustomer,
} from "@/lib/stripe/checkout-pricing";
import { parseStripeBillingMetadata } from "@/lib/stripe/metadata";
import { CUSTOMER_SUBSCRIPTION_STATUS_LABEL } from "@/lib/domain/customer-subscription";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";
import {
  getInvoilessExternalCustomerId,
  getStripeBillingAccount,
  isStripeConfigured,
} from "@/lib/services/billing-service";
import { listBillingInvoicesForCustomer } from "@/lib/services/billing-invoice-service";
import { getCurrentCustomerSubscription } from "@/lib/services/customer-subscription-service";

export async function loadCustomerBillingPageData(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());
  const stripeConfigured = isStripeConfigured();
  const savedMonthlyRate = monthlyRateFromCustomer(customer.stripeMonthlyRateXcd);

  const [
    invoilessId,
    stripeAccount,
    defaultMonthlyRate,
    planOptions,
    stripeInvoices,
    customerSubscription,
    activeAssignmentCount,
  ] = await Promise.all([
    getInvoilessExternalCustomerId(customer.id),
    getStripeBillingAccount(customer.id),
    getDefaultMonthlyRateXcd(),
    listStripeCheckoutPlanOptions(savedMonthlyRate),
    listBillingInvoicesForCustomer(customer.id),
    getCurrentCustomerSubscription(customer.id),
    prisma.serviceAssignment.count({
      where: { customerId: customer.id, status: "active", endDate: null },
    }),
  ]);

  const stripeMeta = stripeAccount ? parseStripeBillingMetadata(stripeAccount.metadata) : null;
  const stripePeriodEnd = stripeMeta?.currentPeriodEnd
    ? new Date(stripeMeta.currentPeriodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const subscriptionPeriodEnd = customerSubscription?.currentPeriodEnd
    ? customerSubscription.currentPeriodEnd.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : stripePeriodEnd;

  const subscriptionMonthlyRate =
    customerSubscription?.monthlyRateXcd != null
      ? Number(customerSubscription.monthlyRateXcd)
      : savedMonthlyRate ?? defaultMonthlyRate;

  const vehicleCount =
    customerSubscription?.vehicleCount ?? activeAssignmentCount;

  const subscriptionSummary = customerSubscription
    ? {
        id: customerSubscription.id,
        status: customerSubscription.status,
        statusLabel: CUSTOMER_SUBSCRIPTION_STATUS_LABEL[customerSubscription.status],
        planTermLabel: formatPlanTerm(customerSubscription.planTermMonths),
        monthlyRateLabel: formatXcd(subscriptionMonthlyRate),
        periodEndLabel: subscriptionPeriodEnd,
        vehicleCount,
        stripeSubscriptionId: customerSubscription.stripeSubscriptionId,
        stripeCustomerId: customerSubscription.stripeCustomerId ?? stripeAccount?.externalCustomerId ?? null,
      }
    : null;

  return {
    customer,
    invoilessConfigured,
    stripeConfigured,
    invoilessId,
    stripeAccount,
    planOptions,
    defaultMonthlyRate,
    savedMonthlyRate,
    stripePeriodEnd,
    stripeInvoices,
    subscriptionSummary,
  };
}
