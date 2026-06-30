import { formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/domain/native-billing";

export type ArAgingBucket = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_90_plus";

export const AR_AGING_BUCKET_LABELS: Record<ArAgingBucket, string> = {
  current: "Current",
  days_1_30: "1–30 days overdue",
  days_31_60: "31–60 days overdue",
  days_61_90: "61–90 days overdue",
  days_90_plus: "90+ days overdue",
};

export const AR_AGING_BUCKET_ORDER: ArAgingBucket[] = [
  "current",
  "days_1_30",
  "days_31_60",
  "days_61_90",
  "days_90_plus",
];

export function formatReportMoney(amount: number, currency = "XCD"): string {
  return formatMoney(amount, currency);
}

export function monthLabelUtc(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-029", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export { PAYMENT_METHOD_LABELS };
