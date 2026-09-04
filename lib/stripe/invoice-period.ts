import type Stripe from "stripe";

type InvoicePeriodSource = {
  period_start?: number | null;
  period_end?: number | null;
  lines?: {
    data?: Array<{ period?: { start?: number | null; end?: number | null } | null }>;
  } | null;
};

function toDate(seconds: number | null | undefined): Date | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/**
 * Invoice coverage dates. Prefer invoice-level period (pre-Basil), then widen
 * from line-item periods (Basil payloads often omit invoice.period_*).
 */
export function stripeInvoicePeriod(invoice: Stripe.Invoice): {
  start: Date | null;
  end: Date | null;
} {
  const inv = invoice as Stripe.Invoice & InvoicePeriodSource;
  let startSec = inv.period_start ?? null;
  let endSec = inv.period_end ?? null;

  for (const line of inv.lines?.data ?? []) {
    const s = line.period?.start;
    const e = line.period?.end;
    if (s != null && Number.isFinite(s) && (startSec == null || s < startSec)) startSec = s;
    if (e != null && Number.isFinite(e) && (endSec == null || e > endSec)) endSec = e;
  }

  return { start: toDate(startSec), end: toDate(endSec) };
}
