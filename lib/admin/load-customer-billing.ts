import "server-only";

import { toBillingInvoiceClientRow } from "@/lib/admin/billing-invoice-client";
import { prisma } from "@/lib/db";
import { isInvoilessLegacyUiEnabled } from "@/lib/domain/native-billing-cutover";
import { isCatalogRateTier } from "@/lib/domain/billing-catalog";
import { CUSTOMER_SUBSCRIPTION_STATUS_LABEL } from "@/lib/domain/customer-subscription";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";
import {
  getInvoilessExternalCustomerId,
  getStripeBillingAccount,
  isStripeConfigured,
} from "@/lib/services/billing-service";
import { listBillingInvoicesForCustomer } from "@/lib/services/billing-invoice-service";
import { listActiveAssignmentsForRenewal } from "@/lib/services/assignment-renewal-service";
import { getBillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import { getCurrentCustomerSubscription } from "@/lib/services/customer-subscription-service";
import { getLatestPaymentDeclineFollowUpForCustomer } from "@/lib/stripe/payment-failure-recovery";
import {
  effectiveMonthlyRateForCheckout,
  getDefaultMonthlyRateXcd,
  listStripeCheckoutPlanOptions,
  monthlyRateFromCustomer,
} from "@/lib/stripe/checkout-pricing";
import { parseStripeBillingMetadata } from "@/lib/stripe/metadata";
import { compareTlStripeSubscription } from "@/lib/services/stripe-subscription-sync-service";
import { billableAssignmentWhere } from "@/lib/domain/service-assignment-queries";

export async function loadCustomerBillingPageData(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const invoilessConfigured = isInvoilessLegacyUiEnabled();
  const stripeConfigured = isStripeConfigured();
  const savedMonthlyRate = monthlyRateFromCustomer(customer.stripeMonthlyRateXcd);
  const defaultMonthlyRate = await getDefaultMonthlyRateXcd();

  const ratePresetForPlans =
    savedMonthlyRate != null && isCatalogRateTier(savedMonthlyRate)
      ? String(savedMonthlyRate)
      : savedMonthlyRate != null
        ? "custom"
        : "default";
  const { monthlyRateXcd: planMonthlyRate, useCustomPricing: planUseCustom } =
    effectiveMonthlyRateForCheckout(ratePresetForPlans, savedMonthlyRate, defaultMonthlyRate);

  const activeAssignmentCount = await prisma.serviceAssignment.count({
    where: { customerId: customer.id, ...billableAssignmentWhere },
  });
  const defaultVehicleCount = Math.max(1, activeAssignmentCount);

  const [
    invoilessId,
    stripeAccount,
    planOptions,
    stripeInvoices,
    customerSubscription,
    billingSetup,
    renewalAssignments,
    paymentDeclineFollowUp,
  ] = await Promise.all([
      getInvoilessExternalCustomerId(customer.id),
      getStripeBillingAccount(customer.id),
      listStripeCheckoutPlanOptions({
        monthlyRateXcd: planMonthlyRate,
        vehicleCount: defaultVehicleCount,
        useCustomPricing: planUseCustom,
      }),
      listBillingInvoicesForCustomer(customer.id),
      getCurrentCustomerSubscription(customer.id),
      getBillingSetupStatus(customer.id),
      listActiveAssignmentsForRenewal(customer.id),
      getLatestPaymentDeclineFollowUpForCustomer(customer.id),
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
    customerSubscription?.vehicleCount ?? defaultVehicleCount;

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
        stripeCustomerId:
          customerSubscription.stripeCustomerId ?? stripeAccount?.externalCustomerId ?? null,
      }
    : null;

  const catalogConfigured = planOptions.some((p) => p.usesCatalogPrice);

  const stripeSync =
    customer.billingMode === "stripe_subscription" && stripeConfigured
      ? await compareTlStripeSubscription(customer.id)
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
    savedPlanTermMonths: customerSubscription?.planTermMonths ?? null,
    defaultVehicleCount,
    catalogConfigured,
    billingSetup,
    stripePeriodEnd,
    stripeInvoices: stripeInvoices.map(toBillingInvoiceClientRow),
    subscriptionSummary,
    stripeSync,
    paymentDeclineFollowUp,
    renewalAssignments: renewalAssignments.map((a) => ({
      id: a.id,
      intervalMonths: a.intervalMonths,
      nextDueDate: a.nextDueDate?.toISOString() ?? null,
      frozenNextDueDate: a.frozenNextDueDate?.toISOString() ?? null,
      pausedAt: a.pausedAt?.toISOString() ?? null,
      pauseReason: a.pauseReason,
      pauseNote: a.pauseNote,
      lastPaymentStatus: a.lastPaymentStatus,
      lastInvoiceId: a.lastInvoiceId,
      status: a.status,
      device: {
        id: a.device.id,
        imei: a.device.imei,
        label: a.device.label,
        objectType: a.device.objectType,
      },
    })),
  };
}
