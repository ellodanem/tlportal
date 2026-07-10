import type { CustomerBillingMode, PaymentRemindersPreference } from "@prisma/client";

export type { PaymentRemindersPreference };

export const PAYMENT_REMINDERS_PREFERENCE_LABEL: Record<PaymentRemindersPreference, string> = {
  auto: "Auto",
  on: "On",
  off: "Off",
};

/**
 * Whether scheduled payment due/overdue reminders should go out (WhatsApp ladder today;
 * same gate for any future email/SMS due nudges).
 *
 * - `off` → never
 * - `on` → always (staff override)
 * - `auto` → manual/cash only; Stripe is off (card declines use the payment-failed series)
 */
export function customerReceivesPaymentReminders(input: {
  billingMode: CustomerBillingMode;
  paymentReminders: PaymentRemindersPreference;
}): boolean {
  if (input.paymentReminders === "off") return false;
  if (input.paymentReminders === "on") return true;
  return input.billingMode === "manual_legacy";
}

/** Short staff-facing label for billing UI. */
export function paymentRemindersStatusLabel(input: {
  billingMode: CustomerBillingMode;
  paymentReminders: PaymentRemindersPreference;
}): string {
  const pref = PAYMENT_REMINDERS_PREFERENCE_LABEL[input.paymentReminders];
  const effective = customerReceivesPaymentReminders(input);
  if (input.paymentReminders === "auto") {
    return effective
      ? "Reminders: Auto (on — manual payer)"
      : "Reminders: Auto (off — Stripe; decline follow-up covers failures)";
  }
  return effective ? `Reminders: ${pref}` : `Reminders: ${pref}`;
}
