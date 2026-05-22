import "server-only";

import type Stripe from "stripe";

export type PaidInvoicePdfLine = {
  index: number;
  description: string;
  qty: string;
  rate: number;
  amount: number;
};

function majorFromMinor(units: number | null | undefined): number {
  return Math.round(((units ?? 0) / 100) * 100) / 100;
}

export function parseStripeInvoicePdfLines(invoice: Stripe.Invoice): PaidInvoicePdfLine[] {
  const data = invoice.lines?.data ?? [];
  return data.map((line, i) => {
    const amount = majorFromMinor(line.amount);
    const qtyNum = line.quantity ?? 1;
    const rate = qtyNum !== 0 ? amount / qtyNum : amount;

    let description = line.description?.trim() || "Line item";
    if (line.period?.start != null && line.period?.end != null) {
      const ps = new Date(line.period.start * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const pe = new Date(line.period.end * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      description += `\nService period: ${ps} – ${pe}`;
    }

    return {
      index: i + 1,
      description,
      qty: String(qtyNum),
      rate,
      amount,
    };
  });
}

export function stripeInvoiceTotals(invoice: Stripe.Invoice): {
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
} {
  const subtotal = majorFromMinor(invoice.subtotal);
  const total = majorFromMinor(invoice.total);
  const amountPaid = majorFromMinor(invoice.amount_paid ?? invoice.total);
  const discount = Math.max(0, Math.round((subtotal - total) * 100) / 100);
  return { subtotal, discount, total, amountPaid };
}

export async function stripePaymentMethodLabel(
  stripe: import("stripe").Stripe,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const chargeId = typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id;
  if (!chargeId) return "Card";

  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const card = charge.payment_method_details?.card;
    if (card?.brand && card.last4) {
      return `${card.brand.toUpperCase()} ···· ${card.last4}`;
    }
    return charge.payment_method_details?.type ?? "Card";
  } catch {
    return "Card";
  }
}
