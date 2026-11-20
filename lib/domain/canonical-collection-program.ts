import { addUtcDays, startOfUtcDay } from "@/lib/billing/recurring-period";

export const COLLECTION_CARD_LINK_LEAD_DAYS = 3;

export type CollectionProgramStatus = "armed" | "completed" | "canceled";
export type CollectionCheckoutKind = "card_on_file" | "pay_now";
export type CollectionDailyAction = "none" | "send_card_on_file" | "send_pay_now" | "complete";

export function utcDayString(value: Date): string {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

export function collectionCardLinkStartDate(firstChargeDate: Date, leadDays = COLLECTION_CARD_LINK_LEAD_DAYS): Date {
  return addUtcDays(startOfUtcDay(firstChargeDate), -leadDays);
}

export function collectionDailyAction(input: {
  today: Date;
  firstChargeDate: Date;
  status: CollectionProgramStatus;
  hasOpenStripeLink: boolean;
  lastCardLinkSentOn: Date | null;
  lastPayNowSentOn: Date | null;
  leadDays?: number;
}): CollectionDailyAction {
  if (input.hasOpenStripeLink) return "complete";
  if (input.status !== "armed") return "none";

  const today = startOfUtcDay(input.today);
  const firstCharge = startOfUtcDay(input.firstChargeDate);
  const windowStart = collectionCardLinkStartDate(firstCharge, input.leadDays ?? COLLECTION_CARD_LINK_LEAD_DAYS);

  if (today.getTime() < windowStart.getTime()) return "none";
  if (today.getTime() < firstCharge.getTime()) {
    if (input.lastCardLinkSentOn && utcDayString(input.lastCardLinkSentOn) === utcDayString(today)) return "none";
    return "send_card_on_file";
  }
  if (input.lastPayNowSentOn && utcDayString(input.lastPayNowSentOn) === utcDayString(today)) return "none";
  return "send_pay_now";
}

export function showSubscriptionCollectionTab(input: {
  collectionMethod: string | null;
  hasCollectionProgram: boolean;
}): boolean {
  return input.collectionMethod === "stripe_autocharge" || input.hasCollectionProgram;
}
