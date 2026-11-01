/**
 * Shared, scope-aware read model for invoices and payments.
 *
 * One function turns raw rows into ledger rows and totals for either a whole customer or a
 * single subscription, so the two scopes always agree. Rules:
 *  - A Stripe mirror (native Invoice with `billingInvoiceId`) and its provider row are ONE row.
 *  - Drafts, voids, write-offs and archived invoices are never counted as billed or outstanding.
 *  - Payments come only from canonical Payment rows that are not voided. Provider status alone
 *    never creates a payment, so a mirror cannot be counted twice.
 *  - Money is never summed across currencies.
 *  - An invoice with no subscription link is reported as "Not linked to a subscription"; it is
 *    never silently attributed and never hidden.
 */

export type LedgerNativeInvoice = {
  id: string;
  number: string | null;
  status: string;
  kind: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  issueDate: Date;
  dueDate: Date | null;
  customerSubscriptionId: string | null;
  billingInvoiceId: string | null;
  archivedAt: Date | null;
};

export type LedgerProviderInvoice = {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  customerSubscriptionId: string | null;
  provider: string;
};

export type LedgerPayment = {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: string;
  receivedAt: Date;
  voidedAt: Date | null;
  reference: string | null;
};

export type LedgerSource = "native" | "stripe" | "invoiless";

export type LedgerRow = {
  key: string;
  source: LedgerSource;
  /** Native invoice id when a native invoice exists; staff manage it in Billing. */
  nativeInvoiceId: string | null;
  providerInvoiceId: string | null;
  label: string;
  status: string;
  kind: string | null;
  date: Date;
  dueDate: Date | null;
  currency: string;
  total: number;
  paid: number;
  due: number;
  subscriptionId: string | null;
  /** True when staff should expect this to count toward what the customer owes. */
  countsAsOutstanding: boolean;
};

export type LedgerTotals = { currency: string; invoiced: number; outstanding: number; paymentsReceived: number };

export type FinancialLedger = {
  scope: LedgerScope;
  rows: LedgerRow[];
  payments: (LedgerPayment & { invoiceLabel: string; subscriptionId: string | null })[];
  totalsByCurrency: LedgerTotals[];
  /** A single outstanding figure only when exactly one currency is involved; otherwise null. */
  outstanding: { amount: number; currency: string } | null;
  /** Customer-wide invoices that carry no subscription link (always computed from the full customer set). */
  unlinked: { count: number; outstandingByCurrency: { currency: string; amount: number }[] };
};

export type LedgerScope = { type: "customer" } | { type: "subscription"; subscriptionId: string };

const EXCLUDED_NATIVE = new Set(["draft", "void", "written_off"]);
const OPEN_NATIVE = new Set(["open", "partially_paid", "overdue", "sent"]);

function cents(value: number): number {
  return Math.round(value * 100);
}

function normalizeCurrency(value: string | null | undefined): string {
  return (value ?? "XCD").trim().toUpperCase() || "XCD";
}

function providerSource(provider: string): LedgerSource {
  return provider === "invoiless" ? "invoiless" : "stripe";
}

/** Builds every ledger row for a customer. Scope filtering happens after, on the same rows. */
export function buildLedgerRows(input: { nativeInvoices: LedgerNativeInvoice[]; providerInvoices: LedgerProviderInvoice[] }): LedgerRow[] {
  const providersById = new Map(input.providerInvoices.map((provider) => [provider.id, provider]));
  const mirroredProviderIds = new Set<string>();
  const rows: LedgerRow[] = [];

  for (const invoice of input.nativeInvoices) {
    if (invoice.archivedAt) continue;
    const provider = invoice.billingInvoiceId ? providersById.get(invoice.billingInvoiceId) : undefined;
    if (invoice.billingInvoiceId) mirroredProviderIds.add(invoice.billingInvoiceId);
    const excluded = EXCLUDED_NATIVE.has(invoice.status);
    rows.push({
      key: `native:${invoice.id}`,
      source: provider ? providerSource(provider.provider) : "native",
      nativeInvoiceId: invoice.id,
      providerInvoiceId: provider?.id ?? null,
      label: invoice.number ?? provider?.number ?? "Draft invoice",
      status: invoice.status,
      kind: invoice.kind,
      date: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: normalizeCurrency(invoice.currency),
      total: invoice.total,
      paid: invoice.amountPaid,
      due: excluded ? 0 : invoice.amountDue,
      // Subscription attribution on the native row wins; the provider row is only a fallback.
      subscriptionId: invoice.customerSubscriptionId ?? provider?.customerSubscriptionId ?? null,
      countsAsOutstanding: !excluded && invoice.amountDue > 0,
    });
  }

  for (const provider of input.providerInvoices) {
    if (mirroredProviderIds.has(provider.id)) continue;
    const status = provider.status.toLowerCase();
    if (status === "draft" || status === "void") continue;
    const paid = status === "paid";
    const open = status === "open" || status === "uncollectible" || status === "past_due" || status === "unpaid";
    rows.push({
      key: `provider:${provider.id}`,
      source: providerSource(provider.provider),
      nativeInvoiceId: null,
      providerInvoiceId: provider.id,
      label: provider.number ?? "Provider invoice",
      status: provider.status,
      kind: null,
      date: provider.createdAt,
      dueDate: null,
      currency: normalizeCurrency(provider.currency),
      total: provider.amount,
      paid: paid ? provider.amount : 0,
      due: open ? provider.amount : 0,
      subscriptionId: provider.customerSubscriptionId,
      countsAsOutstanding: open && provider.amount > 0,
    });
  }

  return rows.sort((left, right) => right.date.getTime() - left.date.getTime() || left.key.localeCompare(right.key));
}

export function buildFinancialLedger(input: {
  scope: LedgerScope;
  nativeInvoices: LedgerNativeInvoice[];
  providerInvoices: LedgerProviderInvoice[];
  payments: LedgerPayment[];
}): FinancialLedger {
  const allRows = buildLedgerRows(input);
  const inScope = (subscriptionId: string | null) => input.scope.type === "customer" || subscriptionId === input.scope.subscriptionId;
  const rows = allRows.filter((row) => inScope(row.subscriptionId));

  const rowByNativeId = new Map(allRows.filter((row) => row.nativeInvoiceId).map((row) => [row.nativeInvoiceId as string, row]));
  const payments = input.payments
    .filter((payment) => payment.voidedAt == null)
    .flatMap((payment) => {
      const row = rowByNativeId.get(payment.invoiceId);
      if (!row || !inScope(row.subscriptionId)) return [];
      return [{ ...payment, invoiceLabel: row.label, subscriptionId: row.subscriptionId }];
    })
    .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime());

  const totals = new Map<string, { invoiced: number; outstanding: number; paymentsReceived: number }>();
  const bucket = (currency: string) => {
    const existing = totals.get(currency) ?? { invoiced: 0, outstanding: 0, paymentsReceived: 0 };
    totals.set(currency, existing);
    return existing;
  };
  for (const row of rows) {
    if (EXCLUDED_NATIVE.has(row.status.toLowerCase())) continue;
    const entry = bucket(row.currency);
    entry.invoiced += cents(row.total);
    entry.outstanding += cents(row.due);
  }
  for (const payment of payments) bucket(normalizeCurrency(payment.currency)).paymentsReceived += cents(payment.amount);

  const totalsByCurrency = [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => ({ currency, invoiced: value.invoiced / 100, outstanding: value.outstanding / 100, paymentsReceived: value.paymentsReceived / 100 }));

  const unlinkedRows = allRows.filter((row) => row.subscriptionId == null && !EXCLUDED_NATIVE.has(row.status.toLowerCase()));
  const unlinkedOutstanding = new Map<string, number>();
  for (const row of unlinkedRows) unlinkedOutstanding.set(row.currency, (unlinkedOutstanding.get(row.currency) ?? 0) + cents(row.due));

  return {
    scope: input.scope,
    rows,
    payments,
    totalsByCurrency,
    outstanding: totalsByCurrency.length === 1 ? { amount: totalsByCurrency[0].outstanding, currency: totalsByCurrency[0].currency } : null,
    unlinked: {
      count: unlinkedRows.length,
      outstandingByCurrency: [...unlinkedOutstanding.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount: amount / 100 })),
    },
  };
}

export const NOT_LINKED_LABEL = "Not linked to a subscription";

export function isOpenInvoiceStatus(status: string): boolean {
  return OPEN_NATIVE.has(status);
}
