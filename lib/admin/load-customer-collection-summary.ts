import "server-only";

import { prisma } from "@/lib/db";
import { deriveCustomerCollectionSummary } from "@/lib/domain/customer-collection-summary";

export async function loadCustomerCollectionSummary(customerId: string, asOf = new Date()) {
  const [customer, subscriptions, billingAccount, billingInvoices, nativeInvoices, deliveries] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
    prisma.customerSubscription.findMany({
      where: {
        customerId,
        status: { not: "canceled" },
        OR: [
          { lifecycleStatus: null },
          { lifecycleStatus: { notIn: ["ended", "canceled"] } },
        ],
      },
      orderBy: { nextBillingDate: "asc" },
      select: { status: true, collectionHealth: true, nextBillingDate: true, currentPeriodEnd: true },
    }),
    prisma.billingAccount.findUnique({
      where: { customerId_provider: { customerId, provider: "stripe" } },
      select: { status: true },
    }),
    prisma.billingInvoice.findMany({
      where: { customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 24,
      select: {
        id: true,
        kind: true,
        customerSubscriptionId: true,
        status: true,
        displayNumber: true,
        providerInvoiceNumber: true,
        externalInvoiceId: true,
        amountXcd: true,
        currency: true,
        createdAt: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        receiptEmailedAt: true,
        hostedInvoiceUrl: true,
      },
    }),
    prisma.invoice.findMany({
      where: { customerId, archivedAt: null, billingInvoiceId: null },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      take: 24,
      select: {
        id: true,
        kind: true,
        customerSubscriptionId: true,
        status: true,
        number: true,
        total: true,
        amountDue: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        paidAt: true,
        sentAt: true,
        recurringDeliveryStatus: true,
        recurringDeliveryError: true,
      },
    }),
    prisma.billingNotificationDelivery.findMany({
      where: { customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: { invoiceId: true, status: true, channel: true, sentAt: true, createdAt: true },
    }),
  ]);

  if (!customer) return null;
  const subscriptionRenewalDate = subscriptions.map((subscription) => subscription.nextBillingDate ?? subscription.currentPeriodEnd)
    .filter((value): value is Date => value != null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return deriveCustomerCollectionSummary({
    asOf,
    // Device-assignment due dates are operational history, not receivables. Only
    // an invoice or a subscription collection signal can put an account overdue.
    serviceRenewalDueDate: null,
    subscriptionRenewalDate,
    subscriptionStatuses: subscriptions.map((subscription) => subscription.status),
    collectionHealthStatuses: subscriptions.map((subscription) => subscription.collectionHealth ?? ""),
    billingAccountStatus: billingAccount?.status ?? null,
    hasSubscriptionContext: subscriptions.length > 0,
    invoices: [
      ...billingInvoices.map((invoice) => ({
        id: invoice.id,
        source: "stripe" as const,
        subscriptionInvoice: invoice.kind === "subscription" || invoice.customerSubscriptionId != null,
        status: invoice.status,
        number: invoice.displayNumber ?? invoice.providerInvoiceNumber ?? invoice.externalInvoiceId,
        amount: Number(invoice.amountXcd),
        amountDue: invoice.status.toLowerCase() === "paid" ? 0 : Number(invoice.amountXcd),
        currency: invoice.currency,
        invoiceDate: invoice.periodStart ?? invoice.createdAt,
        dueDate: invoice.periodEnd,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        paidAt: invoice.paidAt,
        sentAt: null,
        receiptEmailedAt: invoice.receiptEmailedAt,
        deliveryStatus: null,
        deliveryError: null,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      })),
      ...nativeInvoices.map((invoice) => ({
        id: invoice.id,
        source: "native" as const,
        subscriptionInvoice: invoice.kind === "recurring" || invoice.customerSubscriptionId != null,
        status: invoice.status,
        number: invoice.number,
        amount: Number(invoice.total),
        amountDue: Number(invoice.amountDue),
        currency: invoice.currency,
        invoiceDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        periodStart: invoice.issueDate,
        periodEnd: null,
        paidAt: invoice.paidAt,
        sentAt: invoice.sentAt,
        receiptEmailedAt: null,
        deliveryStatus: invoice.recurringDeliveryStatus,
        deliveryError: invoice.recurringDeliveryError,
        hostedInvoiceUrl: null,
      })),
    ],
    deliveries,
  });
}
