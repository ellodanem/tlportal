import type { InvoiceKind, InvoiceStatus, PaymentMethod, QuoteStatus, RecurringScheduleStatus } from "@prisma/client";

/** Round to 2 decimal places, avoiding common float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Format a number as a 2dp string for a Decimal(_, 2) column. */
export function toMoneyString(n: number): string {
  return round2(n).toFixed(2);
}

/** Format a quantity as a 4dp string for a Decimal(_, 4) column. */
export function toQtyString(n: number): string {
  return n.toFixed(4);
}

export type DocumentLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string | null;
  sortOrder?: number;
};

export type DocumentTotals = {
  subtotal: number;
  taxTotal: number;
  total: number;
};

export function computeLineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

/**
 * Compute subtotal / single document-level tax / total from line items.
 * `taxRatePercent` is an optional whole/decimal percent (e.g. 15 for 15% VAT).
 */
export function computeDocumentTotals(
  lines: DocumentLineInput[],
  taxRatePercent?: number | null,
): DocumentTotals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + computeLineTotal(line.quantity, line.unitPrice), 0),
  );
  const rate = taxRatePercent && Number.isFinite(taxRatePercent) ? taxRatePercent : 0;
  const taxTotal = round2(subtotal * (rate / 100));
  const total = round2(subtotal + taxTotal);
  return { subtotal, taxTotal, total };
}

/**
 * Paid-state for an open invoice from its money snapshot.
 * Does not return draft/void/overdue/written_off — those are set explicitly by callers.
 */
export function derivePaidState(
  total: number,
  amountPaid: number,
): Extract<InvoiceStatus, "open" | "partially_paid" | "paid"> {
  if (amountPaid <= 0) return "open";
  if (round2(amountPaid) >= round2(total)) return "paid";
  return "partially_paid";
}

// --- Display labels ---

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted: "Converted",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  written_off: "Written off",
};

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  one_off: "One-off",
  recurring: "Recurring",
  subscription_mirror: "Subscription",
};

export const RECURRING_SCHEDULE_STATUS_LABELS: Record<RecurringScheduleStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

export const RECURRING_INTERVAL_MONTH_OPTIONS = [
  { months: 1, label: "Monthly" },
  { months: 3, label: "Quarterly (3 mo)" },
  { months: 6, label: "Semi-annual (6 mo)" },
  { months: 12, label: "Annual (12 mo)" },
] as const;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "Stripe (card)",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  card_manual: "Card (manual)",
  other: "Other",
};

/** Caribbean-style money formatting; XCD renders as `EC$`. */
export function formatMoney(amount: number, currency = "XCD"): string {
  const code = currency.toUpperCase();
  const formatted = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-029", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return code === "XCD" ? `EC$${formatted}` : `${code} ${formatted}`;
}
