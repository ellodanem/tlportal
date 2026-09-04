import type Stripe from "stripe";

type InvoiceLinePeriodSource = {
  amount?: number | null;
  proration?: boolean | null;
  period?: { start?: number | null; end?: number | null } | null;
  parent?: {
    type?: string | null;
    subscription_item_details?: { proration?: boolean | null } | null;
    invoice_item_details?: { proration?: boolean | null } | null;
  } | null;
};

type InvoicePeriodSource = {
  period_start?: number | null;
  period_end?: number | null;
  lines?: { data?: InvoiceLinePeriodSource[] } | null;
};

function toDate(seconds: number | null | undefined): Date | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

function isProrationLine(line: InvoiceLinePeriodSource): boolean {
  if (line.proration === true) return true;
  if (line.parent?.subscription_item_details?.proration === true) return true;
  if (line.parent?.invoice_item_details?.proration === true) return true;
  return false;
}

function spanFromLines(lines: InvoiceLinePeriodSource[]): {
  start: number | null;
  end: number | null;
} {
  let startSec: number | null = null;
  let endSec: number | null = null;
  for (const line of lines) {
    const s = line.period?.start;
    const e = line.period?.end;
    if (s != null && Number.isFinite(s) && (startSec == null || s < startSec)) startSec = s;
    if (e != null && Number.isFinite(e) && (endSec == null || e > endSec)) endSec = e;
  }
  return { start: startSec, end: endSec };
}

/**
 * Billing period shown on the Billing tab.
 *
 * Do not union every line: subscription-update invoices include unused-time
 * credits from the previous cycle plus the new cycle, which would look like
 * Jul–Sep for a one-month charge.
 */
export function stripeInvoicePeriod(invoice: Stripe.Invoice): {
  start: Date | null;
  end: Date | null;
} {
  const inv = invoice as Stripe.Invoice & InvoicePeriodSource;
  const lines = inv.lines?.data ?? [];

  const recurring = spanFromLines(lines.filter((line) => !isProrationLine(line)));
  if (recurring.start != null || recurring.end != null) {
    return { start: toDate(recurring.start), end: toDate(recurring.end) };
  }

  const charged = spanFromLines(lines.filter((line) => (line.amount ?? 0) > 0));
  if (charged.start != null || charged.end != null) {
    return { start: toDate(charged.start), end: toDate(charged.end) };
  }

  if (inv.period_start != null || inv.period_end != null) {
    return { start: toDate(inv.period_start), end: toDate(inv.period_end) };
  }

  const all = spanFromLines(lines);
  return { start: toDate(all.start), end: toDate(all.end) };
}
