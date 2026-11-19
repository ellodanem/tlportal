import type { CustomerBillingMode, PaymentRemindersPreference } from "@prisma/client";

export type { PaymentRemindersPreference };

export const PAYMENT_REMINDERS_PREFERENCE_LABEL: Record<PaymentRemindersPreference, string> = {
  auto: "Auto",
  on: "On",
  off: "Off",
};

/**
 * Kill switch for the daily due/overdue/upcoming reminder program (email + WhatsApp).
 *
 * Staff one-off reminders, Stripe payment-received confirmations, and card-decline
 * follow-up stay on. Stripe webhooks that record a paid invoice and advance renewals
 * are independent of this flag — including Zoho-originated Stripe charges (Royal Delivery)
 * that update the customer workspace after the move to the subscription page.
 */
export const SCHEDULED_PAYMENT_REMINDERS_ENABLED = false;

export type PaymentReminderEligibilityInput = {
  billingMode: CustomerBillingMode;
  paymentReminders: PaymentRemindersPreference;
  /**
   * True when a live canonical subscription is collected by Stripe auto-charge.
   * Covers adopted / linked Stripe billing even if `billingMode` is still `manual_legacy`.
   */
  stripeAutoCharge?: boolean;
};

/**
 * Whether scheduled payment due/overdue reminders should go out (WhatsApp ladder today;
 * same gate for any future email/SMS due nudges).
 *
 * - `off` → never
 * - `on` → always (staff override)
 * - `auto` → manual/cash only; Stripe is off (card declines use the payment-failed series)
 *
 * Does not consult `SCHEDULED_PAYMENT_REMINDERS_ENABLED`. Use
 * `customerIsDueScheduledPaymentReminder` at send time.
 */
export function customerReceivesPaymentReminders(input: PaymentReminderEligibilityInput): boolean {
  if (input.paymentReminders === "off") return false;
  if (input.paymentReminders === "on") return true;
  if (input.stripeAutoCharge) return false;
  return input.billingMode === "manual_legacy";
}

/** True only when the daily reminder program is on and this customer is eligible. */
export function customerIsDueScheduledPaymentReminder(input: PaymentReminderEligibilityInput): boolean {
  return SCHEDULED_PAYMENT_REMINDERS_ENABLED && customerReceivesPaymentReminders(input);
}

/** Short staff-facing label for billing UI. */
export function paymentRemindersStatusLabel(input: PaymentReminderEligibilityInput): string {
  if (!SCHEDULED_PAYMENT_REMINDERS_ENABLED) {
    return "Reminders: Off (automatic program disabled)";
  }
  const pref = PAYMENT_REMINDERS_PREFERENCE_LABEL[input.paymentReminders];
  const effective = customerReceivesPaymentReminders(input);
  if (input.paymentReminders === "auto") {
    return effective
      ? "Reminders: Auto (on — manual payer)"
      : "Reminders: Auto (off — Stripe; decline follow-up covers failures)";
  }
  return effective ? `Reminders: ${pref}` : `Reminders: ${pref}`;
}
