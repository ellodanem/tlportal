import "server-only";

import { prisma } from "@/lib/db";
import {
  buildFinancialLedger,
  type FinancialLedger,
  type LedgerNativeInvoice,
  type LedgerPayment,
  type LedgerProviderInvoice,
} from "@/lib/domain/financial-ledger";

const LEDGER_LIMIT = 200;

async function loadCustomerLedgerInputs(customerId: string) {
  const [invoices, providerInvoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId, archivedAt: null },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      take: LEDGER_LIMIT,
      select: {
        id: true, number: true, status: true, kind: true, total: true, amountPaid: true, amountDue: true, currency: true,
        issueDate: true, dueDate: true, customerSubscriptionId: true, billingInvoiceId: true, archivedAt: true,
      },
    }),
    prisma.billingInvoice.findMany({
      where: { customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LEDGER_LIMIT,
      select: { id: true, displayNumber: true, providerInvoiceNumber: true, status: true, amountXcd: true, currency: true, createdAt: true, paidAt: true, customerSubscriptionId: true, provider: true },
    }),
    prisma.payment.findMany({
      where: { customerId, voidedAt: null },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: LEDGER_LIMIT,
      select: { id: true, invoiceId: true, amount: true, currency: true, method: true, receivedAt: true, voidedAt: true, reference: true },
    }),
  ]);

  const nativeInvoices: LedgerNativeInvoice[] = invoices.map((invoice) => ({
    ...invoice,
    total: Number(invoice.total),
    amountPaid: Number(invoice.amountPaid),
    amountDue: Number(invoice.amountDue),
  }));
  const provider: LedgerProviderInvoice[] = providerInvoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.displayNumber ?? invoice.providerInvoiceNumber,
    status: invoice.status,
    amount: Number(invoice.amountXcd),
    currency: invoice.currency,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt,
    customerSubscriptionId: invoice.customerSubscriptionId,
    provider: String(invoice.provider),
  }));
  const paymentRows: LedgerPayment[] = payments.map((payment) => ({ ...payment, amount: Number(payment.amount), method: String(payment.method) }));
  return { nativeInvoices, providerInvoices: provider, payments: paymentRows };
}

/** Everything the customer owes and has paid, regardless of subscription linkage. */
export async function getCustomerFinancialLedger(customerId: string): Promise<FinancialLedger> {
  return buildFinancialLedger({ scope: { type: "customer" }, ...(await loadCustomerLedgerInputs(customerId)) });
}

/**
 * The same ledger narrowed to one subscription. It is computed from the customer's rows, so
 * customer and subscription balances always agree, and unlinked invoices are reported alongside.
 */
export async function getSubscriptionFinancials(subscriptionId: string, customerId: string): Promise<FinancialLedger> {
  return buildFinancialLedger({ scope: { type: "subscription", subscriptionId }, ...(await loadCustomerLedgerInputs(customerId)) });
}
