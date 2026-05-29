import { buildStripeCheckoutAmountLine } from "@/lib/billing/customer-whatsapp";
import {
  CHECKOUT_LINK_VALID_HOURS,
  checkoutInitialEmailBody,
} from "@/lib/stripe/checkout-messaging";

const PAY_LINK_PLACEHOLDER = "https://… (Stripe Checkout link — created when you send)";

/** Plain-text preview matching Twilio `tl_stripe_payment_link` / `_resend` templates. */
export function buildStripeCheckoutWhatsAppPreview(input: {
  firstName: string;
  amountLine: string;
  isResend: boolean;
}): string {
  const intro = input.isResend
    ? "This is an automated follow-up from Track Lucia. Your subscription payment is still pending."
    : "This is an automated message from Track Lucia. Use the link below to complete your subscription payment.";

  return [
    "AUTOMATED MESSAGE — PLEASE DO NOT REPLY",
    "",
    `Hello ${input.firstName},`,
    "",
    intro,
    "",
    `Amount: ${input.amountLine}`,
    "",
    `Pay now: ${PAY_LINK_PLACEHOLDER}`,
    "",
    `This link expires in about ${CHECKOUT_LINK_VALID_HOURS} hours. If you have already paid, you can ignore this message.`,
    "",
    "— Track Lucia",
    "Billed by Ellodane Enterprises",
  ].join("\n");
}

export function buildStripeCheckoutEmailPreview(greetingName: string): string {
  return checkoutInitialEmailBody({
    greetingName,
    paymentUrl: PAY_LINK_PLACEHOLDER,
  }).text;
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
