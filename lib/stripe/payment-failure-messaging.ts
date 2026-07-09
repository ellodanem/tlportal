/** Customer-facing copy for declined card payments. */

export const TRACK_LUCIA_SUBSCRIPTION_LABEL = "Track Lucia Subscription";

export type PaymentFailureDeclineKind = "native_invoice" | "subscription" | "unknown";

/**
 * Customer-facing payment description — avoids opaque Stripe invoice ids in copy.
 * `subjectLabel` is the clean name; `bodyLabel` adds "your" for generic labels
 * (but not for a specific invoice number, which reads without an article).
 */
export function customerFacingDeclinePaymentLabel(input: {
  kind?: PaymentFailureDeclineKind | null;
  invoiceNumber?: string | null;
}): { subjectLabel: string; bodyLabel: string } {
  const invoiceNumber = input.invoiceNumber?.trim();
  if (input.kind === "native_invoice" || invoiceNumber?.startsWith("TL-INV")) {
    if (invoiceNumber?.startsWith("TL-INV")) {
      return { subjectLabel: invoiceNumber, bodyLabel: invoiceNumber };
    }
    return { subjectLabel: "Track Lucia invoice", bodyLabel: "your Track Lucia invoice" };
  }
  return {
    subjectLabel: TRACK_LUCIA_SUBSCRIPTION_LABEL,
    bodyLabel: `your ${TRACK_LUCIA_SUBSCRIPTION_LABEL}`,
  };
}

/**
 * Short, mid-sentence decline reason for WhatsApp/SMS copy (lowercase, no trailing period).
 * Fits templates like "…but {{2}}. No money was taken."
 */
export function declineCodeShortReason(declineCode: string | null | undefined): string {
  switch (declineCode) {
    case "insufficient_funds":
      return "there weren't enough funds available";
    case "authentication_required":
      return "your bank needs to verify the payment";
    case "card_velocity_exceeded":
    case "withdrawal_count_limit_exceeded":
      return "your bank flagged a transaction limit";
    case "expired_card":
      return "the card appears to be expired";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "the security code was incorrect";
    case "do_not_honor":
    default:
      return "your bank declined the charge";
  }
}

export function declineCodeGuidance(declineCode: string | null | undefined): string {
  switch (declineCode) {
    case "do_not_honor":
      return "Your bank did not approve this charge. Please contact your bank to authorize online payments, or try a different card.";
    case "insufficient_funds":
      return "Your card did not have sufficient funds. Please try another card or add funds before paying again.";
    case "authentication_required":
      return "Your bank requires additional verification for this payment. Please try again and complete any prompts from your bank.";
    case "card_velocity_exceeded":
    case "withdrawal_count_limit_exceeded":
      return "Your bank declined this charge due to a transaction limit. Please contact your bank or try another card.";
    case "expired_card":
      return "Your card appears to be expired. Please use a different card.";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "The card security code was incorrect. Please check your details and try again.";
    default:
      return "Your bank declined the payment. No charge was made. Please try another card or contact your bank.";
  }
}

export function paymentFailureEmailBody(input: {
  greetingName: string;
  amountLabel: string;
  payUrl: string;
  declineCode: string | null;
  kind?: PaymentFailureDeclineKind | null;
  invoiceNumber?: string | null;
}): { text: string; html: string; subject: string } {
  const guidance = declineCodeGuidance(input.declineCode);
  const { subjectLabel, bodyLabel } = customerFacingDeclinePaymentLabel({
    kind: input.kind,
    invoiceNumber: input.invoiceNumber,
  });
  const invoiceLine = ` for ${bodyLabel}`;
  const subject = `Payment declined — ${subjectLabel}`;

  const text = `Hello ${input.greetingName},

We tried to process your card payment${invoiceLine} (${input.amountLabel}), but your bank declined the charge. No money was taken.

${guidance}

You can try again using this link:
${input.payUrl}

If you have questions, reply to this email.

— Track Lucia`;

  const html = `<p>Hello ${escapeHtml(input.greetingName)},</p>
<p>We tried to process your card payment${escapeHtml(invoiceLine)} (<strong>${escapeHtml(input.amountLabel)}</strong>), but your bank declined the charge. <strong>No money was taken.</strong></p>
<p>${escapeHtml(guidance)}</p>
<p><a href="${escapeHtml(input.payUrl)}">Try payment again</a></p>
<p>If you have questions, reply to this email.</p>
<p>— Track Lucia</p>`;

  return { text, html, subject };
}

export type PaymentDeclineEmailPreview = {
  subject: string;
  text: string;
};

/** Plain-text preview for staff UI (same copy as automatic / resend decline email). */
export function buildPaymentDeclineEmailPreview(input: {
  greetingName: string;
  amountLabel: string;
  payUrl: string | null;
  declineCode: string | null;
  kind?: PaymentFailureDeclineKind | null;
  invoiceNumber?: string | null;
}): PaymentDeclineEmailPreview | null {
  if (!input.payUrl?.trim() || input.payUrl.includes("/admin/")) return null;
  const body = paymentFailureEmailBody({
    greetingName: input.greetingName,
    amountLabel: input.amountLabel,
    kind: input.kind,
    invoiceNumber: input.invoiceNumber,
    payUrl: input.payUrl,
    declineCode: input.declineCode,
  });
  return { subject: body.subject, text: body.text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
