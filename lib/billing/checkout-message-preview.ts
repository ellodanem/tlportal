import { buildStripeCheckoutAmountLine } from "@/lib/billing/customer-whatsapp";
import {
  CHECKOUT_LINK_VALID_HOURS,
  checkoutAutoChargeNotice,
  checkoutInitialEmailBody,
} from "@/lib/stripe/checkout-messaging";

const PAY_LINK_PLACEHOLDER = "https://… (Stripe Checkout link — created when you send)";

/**
 * Plain-text preview matching Twilio Content templates:
 * `tl_stripe_payment_link_2` / `tl_stripe_payment_link_resend_2`.
 */
export function buildStripeCheckoutWhatsAppPreview(input: {
  firstName: string;
  amountLine: string;
  durationMonths: number;
  isResend: boolean;
}): string {
  const intro = input.isResend
    ? "This is an automated follow-up from Track Lucia. Your subscription payment is still pending."
    : "This is an automated message from Track Lucia. Use the link below to complete your subscription payment.";

  const expiryPaidClause = input.isResend
    ? "If you have already paid, you can ignore this message."
    : "If you already paid, you can ignore this message.";

  const autoCharge = checkoutAutoChargeNotice(input.durationMonths).whatsapp;

  return [
    `Hello ${input.firstName},`,
    "",
    intro,
    "",
    `Amount: ${input.amountLine}`,
    "",
    `Pay now: ${PAY_LINK_PLACEHOLDER}`,
    "",
    autoCharge,
    "",
    `This link expires in about ${CHECKOUT_LINK_VALID_HOURS} hours. ${expiryPaidClause}`,
    "",
    "— Track Lucia",
    "",
    "AUTOMATED MESSAGE — PLEASE DO NOT REPLY",
  ].join("\n");
}

export function buildStripeCheckoutEmailPreview(input: {
  greetingName: string;
  durationMonths: number;
}): { text: string; html: string } {
  return checkoutInitialEmailBody({
    greetingName: input.greetingName,
    paymentUrl: PAY_LINK_PLACEHOLDER,
    durationMonths: input.durationMonths,
  });
}

export function buildStripeCheckoutAmountLineFromCheckout(input: {
  monthlyRateXcd: number | null;
  durationMonths: number;
  vehicleCount: number;
}): string {
  return buildStripeCheckoutAmountLine({
    monthlyRateXcd: input.monthlyRateXcd,
    durationMonths: input.durationMonths,
    vehicleCount: input.vehicleCount,
  });
}
