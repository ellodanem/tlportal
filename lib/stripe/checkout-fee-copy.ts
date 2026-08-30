import { periodTotalPerVehicleXcd } from "@/lib/domain/subscription-mrr";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";

import { grossUpUnitAmountCents, roundMoney, stripeFeeRatesFromEnv } from "./fees";

export type CheckoutFeeBreakdown = {
  listedTotalXcd: number;
  cardTotalXcd: number;
  unitAmountCents: number;
  vehicleCount: number;
  durationMonths: number;
};

export function checkoutFeeBreakdown(input: {
  monthlyRateXcd: number;
  durationMonths: number;
  vehicleCount: number;
}): CheckoutFeeBreakdown {
  const vehicleCount = Math.max(1, Math.trunc(input.vehicleCount));
  const durationMonths = Math.trunc(input.durationMonths);
  const listedTotalXcd = roundMoney(
    periodTotalPerVehicleXcd(input.monthlyRateXcd, durationMonths) * vehicleCount,
  );
  const unitAmountCents = grossUpUnitAmountCents(
    listedTotalXcd,
    vehicleCount,
    stripeFeeRatesFromEnv(),
  );
  return {
    listedTotalXcd,
    cardTotalXcd: roundMoney((unitAmountCents * vehicleCount) / 100),
    unitAmountCents,
    vehicleCount,
    durationMonths,
  };
}

/** e.g. "EC$330 listed · card total EC$349.70 includes processing" */
export function formatCheckoutListedVsCardLine(listedTotalXcd: number, cardTotalXcd: number): string {
  return `${formatXcd(listedTotalXcd)} listed · card total ${formatXcd(cardTotalXcd)} includes processing`;
}

export function checkoutProductCopy(input: {
  durationMonths: number;
  vehicleCount: number;
  listedTotalXcd: number;
  cardTotalXcd: number;
}): { name: string; description: string } {
  const months = Math.trunc(input.durationMonths);
  const vehicles = Math.max(1, Math.trunc(input.vehicleCount));
  const term = formatPlanTerm(months);
  const name =
    vehicles > 1 ? `Track Lucia — ${term} · ${vehicles} vehicles` : `Track Lucia — ${term}`;
  return {
    name,
    description: formatCheckoutListedVsCardLine(input.listedTotalXcd, input.cardTotalXcd),
  };
}

export function checkoutAmountLine(input: {
  monthlyRateXcd: number | null;
  durationMonths: number;
  vehicleCount: number;
}): string {
  const term = formatPlanTerm(input.durationMonths);
  const vehicles = Math.max(1, Math.trunc(input.vehicleCount));
  const vehicleBit = `${vehicles} vehicle${vehicles === 1 ? "" : "s"}`;
  if (input.monthlyRateXcd == null || !(input.monthlyRateXcd > 0)) {
    return `${term} · ${vehicleBit}`;
  }
  const { listedTotalXcd, cardTotalXcd } = checkoutFeeBreakdown({
    monthlyRateXcd: input.monthlyRateXcd,
    durationMonths: input.durationMonths,
    vehicleCount: vehicles,
  });
  return `${formatCheckoutListedVsCardLine(listedTotalXcd, cardTotalXcd)} · ${term} · ${vehicleBit}`;
}

export function checkoutListedVsCardSentence(input: {
  monthlyRateXcd?: number | null;
  durationMonths: number;
  vehicleCount?: number;
}): { plain: string; html: string } {
  const vehicles = Math.max(1, Math.trunc(input.vehicleCount ?? 1));
  if (input.monthlyRateXcd == null || !(input.monthlyRateXcd > 0)) {
    const fallback = "The card total includes processing.";
    return { plain: fallback, html: fallback };
  }
  const { listedTotalXcd, cardTotalXcd } = checkoutFeeBreakdown({
    monthlyRateXcd: input.monthlyRateXcd,
    durationMonths: input.durationMonths,
    vehicleCount: vehicles,
  });
  const term = formatPlanTerm(input.durationMonths);
  const vehicleBit = vehicles === 1 ? "1 vehicle" : `${vehicles} vehicles`;
  const plain = `The listed amount is ${formatXcd(listedTotalXcd)} per ${term} (${vehicleBit}). The card total is ${formatXcd(cardTotalXcd)} and includes processing.`;
  return { plain, html: escapeHtml(plain) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
