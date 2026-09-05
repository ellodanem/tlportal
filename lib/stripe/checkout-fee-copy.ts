import { periodTotalPerVehicleXcd } from "@/lib/domain/subscription-mrr";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";

import { grossUpUnitAmountCents, roundMoney, stripeFeeRatesFromEnv } from "./fees";

export type CheckoutFeeBreakdown = {
  listedTotalXcd: number;
  cardTotalXcd: number;
  unitAmountCents: number;
  vehicleCount: number;
  durationMonths: number;
  feePassthrough: boolean;
};

export function checkoutFeeBreakdown(input: {
  monthlyRateXcd: number;
  durationMonths: number;
  vehicleCount: number;
  /** Default true — customer pays listed + processing. */
  feePassthrough?: boolean;
}): CheckoutFeeBreakdown {
  const vehicleCount = Math.max(1, Math.trunc(input.vehicleCount));
  const durationMonths = Math.trunc(input.durationMonths);
  const feePassthrough = input.feePassthrough !== false;
  const periodPerVehicle = periodTotalPerVehicleXcd(input.monthlyRateXcd, durationMonths);
  const listedTotalXcd = roundMoney(periodPerVehicle * vehicleCount);
  const unitAmountCents = feePassthrough
    ? grossUpUnitAmountCents(listedTotalXcd, vehicleCount, stripeFeeRatesFromEnv())
    : Math.round(periodPerVehicle * 100);
  return {
    listedTotalXcd,
    cardTotalXcd: roundMoney((unitAmountCents * vehicleCount) / 100),
    unitAmountCents,
    vehicleCount,
    durationMonths,
    feePassthrough,
  };
}

/** e.g. "EC$330 listed · card total EC$349.70 includes processing" */
export function formatCheckoutListedVsCardLine(listedTotalXcd: number, cardTotalXcd: number): string {
  return `${formatXcd(listedTotalXcd)} listed · card total ${formatXcd(cardTotalXcd)} includes processing`;
}

export function checkoutChargeLine(input: {
  listedTotalXcd: number;
  cardTotalXcd: number;
  feePassthrough?: boolean;
}): string {
  if (input.feePassthrough === false) {
    return formatXcd(input.listedTotalXcd);
  }
  return formatCheckoutListedVsCardLine(input.listedTotalXcd, input.cardTotalXcd);
}

export function checkoutProductCopy(input: {
  durationMonths: number;
  vehicleCount: number;
  listedTotalXcd: number;
  cardTotalXcd: number;
  feePassthrough?: boolean;
}): { name: string; description: string } {
  const months = Math.trunc(input.durationMonths);
  const vehicles = Math.max(1, Math.trunc(input.vehicleCount));
  const term = formatPlanTerm(months);
  const name =
    vehicles > 1 ? `Track Lucia — ${term} · ${vehicles} vehicles` : `Track Lucia — ${term}`;
  return {
    name,
    description: checkoutChargeLine(input),
  };
}

export function checkoutAmountLine(input: {
  monthlyRateXcd: number | null;
  durationMonths: number;
  vehicleCount: number;
  feePassthrough?: boolean;
}): string {
  const term = formatPlanTerm(input.durationMonths);
  const vehicles = Math.max(1, Math.trunc(input.vehicleCount));
  const vehicleBit = `${vehicles} vehicle${vehicles === 1 ? "" : "s"}`;
  if (input.monthlyRateXcd == null || !(input.monthlyRateXcd > 0)) {
    return `${term} · ${vehicleBit}`;
  }
  const { listedTotalXcd, cardTotalXcd, feePassthrough } = checkoutFeeBreakdown({
    monthlyRateXcd: input.monthlyRateXcd,
    durationMonths: input.durationMonths,
    vehicleCount: vehicles,
    feePassthrough: input.feePassthrough,
  });
  return `${checkoutChargeLine({ listedTotalXcd, cardTotalXcd, feePassthrough })} · ${term} · ${vehicleBit}`;
}

export function checkoutListedVsCardSentence(input: {
  monthlyRateXcd?: number | null;
  durationMonths: number;
  vehicleCount?: number;
  feePassthrough?: boolean;
}): { plain: string; html: string } {
  const vehicles = Math.max(1, Math.trunc(input.vehicleCount ?? 1));
  const feePassthrough = input.feePassthrough !== false;
  if (input.monthlyRateXcd == null || !(input.monthlyRateXcd > 0)) {
    const fallback = feePassthrough
      ? "The card total includes processing."
      : "You will be charged the listed rate.";
    return { plain: fallback, html: fallback };
  }
  const { listedTotalXcd, cardTotalXcd } = checkoutFeeBreakdown({
    monthlyRateXcd: input.monthlyRateXcd,
    durationMonths: input.durationMonths,
    vehicleCount: vehicles,
    feePassthrough,
  });
  const term = formatPlanTerm(input.durationMonths);
  const vehicleBit = vehicles === 1 ? "1 vehicle" : `${vehicles} vehicles`;
  const plain = feePassthrough
    ? `The listed amount is ${formatXcd(listedTotalXcd)} per ${term} (${vehicleBit}). The card total is ${formatXcd(cardTotalXcd)} and includes processing.`
    : `The amount is ${formatXcd(listedTotalXcd)} per ${term} (${vehicleBit}).`;
  return { plain, html: escapeHtml(plain) };
}

/** Staff-facing note after creating or sending a Checkout link. */
export function checkoutStaffPricingNote(feePassthrough: boolean): string {
  return feePassthrough
    ? "Customer pays listed rate plus card processing."
    : "Track Lucia absorbs card processing; customer pays the listed rate.";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
