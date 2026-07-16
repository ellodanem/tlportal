import "server-only";

import { displayInvoiceNumber } from "@/lib/domain/native-billing-cutover";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/stripe/app-url";

import {
  formatOutstandingInvoiceAmount,
  formatOutstandingInvoiceDueDate,
  type OutstandingInvoiceReminderCandidate,
} from "./outstanding-invoice-reminder";

const NATIVE_STATUSES = ["open", "partially_paid", "overdue"] as const;
const STRIPE_STATUSES = ["open", "past_due", "uncollectible"] as const;

function normalizeDescription(label: string | null | undefined): string | null {
  const value = label?.trim();
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildNativeInvoiceLabel(row: {
  kind: string;
  lineItems: Array<{ description: string }>;
}): string {
  const firstDescription = normalizeDescription(row.lineItems[0]?.description);
  if (firstDescription) return firstDescription;
  if (row.kind === "recurring") return "Recurring invoice";
  if (row.kind === "subscription_mirror") return "Subscription invoice";
  return "Invoice";
}

function buildStripeInvoiceLabel(row: {
  kind: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}): string {
  const base =
    row.kind === "subscription"
      ? "Subscription invoice"
      : `${normalizeDescription(row.kind.replace(/_/g, " ")) ?? "Invoice"} invoice`;
  const start = formatOutstandingInvoiceDueDate(row.periodStart);
  const end = formatOutstandingInvoiceDueDate(row.periodEnd);
  if (start && end) return `${base} (${start} - ${end})`;
  return base;
}

export async function listOutstandingInvoiceReminderCandidates(
  customerId: string,
): Promise<OutstandingInvoiceReminderCandidate[]> {
  const [nativeInvoices, stripeInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        customerId,
        status: { in: [...NATIVE_STATUSES] },
        amountDue: { gt: 0 },
        allowOnlinePayment: true,
        publicToken: { not: null },
      },
      orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
      select: {
        id: true,
        kind: true,
        number: true,
        legacyInvoiceNumber: true,
        status: true,
        amountDue: true,
        currency: true,
        dueDate: true,
        publicToken: true,
        lineItems: {
          select: { description: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
    }),
    prisma.billingInvoice.findMany({
      where: {
        customerId,
        status: { in: [...STRIPE_STATUSES] },
        amountXcd: { gt: 0 },
        hostedInvoiceUrl: { not: null },
      },
      orderBy: [{ periodEnd: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        status: true,
        amountXcd: true,
        currency: true,
        displayNumber: true,
        providerInvoiceNumber: true,
        externalInvoiceId: true,
        periodStart: true,
        periodEnd: true,
        hostedInvoiceUrl: true,
      },
    }),
  ]);

  return [
    ...nativeInvoices.flatMap((invoice) => {
      if (!invoice.publicToken) return [];
      return [
        {
          selectionKey: `native:${invoice.id}`,
          source: "native_invoice" as const,
          sourceId: invoice.id,
          label: buildNativeInvoiceLabel(invoice),
          reference: displayInvoiceNumber(invoice) !== "—" ? displayInvoiceNumber(invoice) : null,
          amountLabel: formatOutstandingInvoiceAmount(Number(invoice.amountDue), invoice.currency),
          dueDateLabel: formatOutstandingInvoiceDueDate(invoice.dueDate),
          paymentUrl: `${getAppBaseUrl()}/pay/i/${encodeURIComponent(invoice.publicToken)}`,
          status: invoice.status,
        },
      ];
    }),
    ...stripeInvoices.flatMap((invoice) => {
      const paymentUrl = invoice.hostedInvoiceUrl?.trim();
      if (!paymentUrl) return [];
      return [
        {
          selectionKey: `stripe:${invoice.id}`,
          source: "stripe_invoice" as const,
          sourceId: invoice.id,
          label: buildStripeInvoiceLabel(invoice),
          reference: invoice.displayNumber?.trim() || invoice.providerInvoiceNumber?.trim() || invoice.externalInvoiceId,
          amountLabel: formatOutstandingInvoiceAmount(Number(invoice.amountXcd), invoice.currency),
          dueDateLabel: formatOutstandingInvoiceDueDate(invoice.periodEnd),
          paymentUrl,
          status: invoice.status,
        },
      ];
    }),
  ];
}
