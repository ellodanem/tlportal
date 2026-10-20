import "server-only";

export type WorkspaceNativeInvoice = {
  currency: string;
  status: "open" | "partially_paid" | "paid" | "overdue";
  total: number;
  amountPaid: number;
  amountDue: number;
};

export type WorkspaceProviderInvoice = {
  currency: string;
  status: string;
  amount: number;
};

/**
 * Summarise one currency only. Provider rows supplied here must already be
 * unmatched (no native mirror), so a paid provider invoice cannot be counted
 * again through a native receipt mirror.
 */
export function summarizeBillingWorkspace({
  currency,
  nativeInvoices,
  providerInvoices,
}: {
  currency: string;
  nativeInvoices: WorkspaceNativeInvoice[];
  providerInvoices: WorkspaceProviderInvoice[];
}) {
  const normalizedCurrency = currency.toUpperCase();
  const native = nativeInvoices.filter((invoice) => invoice.currency.toUpperCase() === normalizedCurrency);
  const providerPaid = providerInvoices.filter(
    (invoice) => invoice.currency.toUpperCase() === normalizedCurrency && invoice.status.toLowerCase() === "paid",
  );
  const outstandingInvoices = native.filter((invoice) => invoice.status !== "paid");
  const overdueInvoices = native.filter((invoice) => invoice.status === "overdue");

  return {
    totalInvoiced:
      native.reduce((total, invoice) => total + invoice.total, 0) +
      providerPaid.reduce((total, invoice) => total + invoice.amount, 0),
    outstanding: outstandingInvoices.reduce((total, invoice) => total + invoice.amountDue, 0),
    overdue: overdueInvoices.reduce((total, invoice) => total + invoice.amountDue, 0),
    collected:
      native.reduce((total, invoice) => total + invoice.amountPaid, 0) +
      providerPaid.reduce((total, invoice) => total + invoice.amount, 0),
    outstandingCount: outstandingInvoices.length,
    overdueCount: overdueInvoices.length,
  };
}
