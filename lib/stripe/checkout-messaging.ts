/** User-facing copy for Stripe Checkout payment links (initial + recovery). */

import { formatPlanTerm } from "@/lib/subscription-options/display";

export const CHECKOUT_LINK_VALID_HOURS = 24;

export const CHECKOUT_RECOVERY_VALID_DAYS = 30;

export function checkoutInitialLinkNotice(): string {
  return `This payment link is valid for about ${CHECKOUT_LINK_VALID_HOURS} hours. If it expires before you pay, we can send a follow-up link (valid up to ${CHECKOUT_RECOVERY_VALID_DAYS} days).`;
}

/** Billing-term line for Checkout emails / WhatsApp (plain, HTML, WhatsApp *bold*). */
export function checkoutAutoChargeNotice(durationMonths: number): {
  plain: string;
  html: string;
  whatsapp: string;
  /** Value for Twilio `{{5}}` — e.g. "3 months" (no asterisks). */
  termLabel: string;
} {
  const termLabel = formatPlanTerm(durationMonths);
  return {
    termLabel,
    plain: `Once this payment link is paid, your card will automatically be charged every ${termLabel} from the payment date.`,
    html: `Once this payment link is paid, your card will <strong>automatically</strong> be charged every <strong>${escapeHtml(termLabel)}</strong> from the payment date.`,
    whatsapp: `Once this payment link is paid, your card will *automatically* be charged every *${termLabel}* from the payment date.`,
  };
}

export function checkoutInitialEmailBody(input: {
  greetingName: string;
  paymentUrl: string;
  durationMonths: number;
}): { text: string; html: string } {
  const notice = checkoutInitialLinkNotice();
  const autoCharge = checkoutAutoChargeNotice(input.durationMonths);
  const text = `Hello ${input.greetingName},

Please use the link below to enter your card and start your subscription.

${input.paymentUrl}

${autoCharge.plain}

${notice}

If you have questions, reply to this email.

— Track Lucia`;

  const html = `<p>Hello ${escapeHtml(input.greetingName)},</p>
<p>Please use the link below to enter your card and start your subscription.</p>
<p><a href="${escapeHtml(input.paymentUrl)}">Complete subscription payment</a></p>
<p>${autoCharge.html}</p>
<p style="font-size:0.9em;color:#555">${escapeHtml(notice)}</p>
<p>If you have questions, reply to this email.</p>
<p>— Track Lucia</p>`;

  return { text, html };
}

export function checkoutRecoveryEmailBody(input: {
  greetingName: string;
  recoveryUrl: string;
}): { text: string; html: string } {
  const text = `Hello ${input.greetingName},

Your earlier Track Lucia payment link expired before checkout was completed. Use this link to finish subscribing (valid up to ${CHECKOUT_RECOVERY_VALID_DAYS} days):

${input.recoveryUrl}

If you already paid or have questions, reply to this email.

— Track Lucia`;

  const html = `<p>Hello ${escapeHtml(input.greetingName)},</p>
<p>Your earlier payment link expired. Use the link below to finish subscribing (valid up to ${CHECKOUT_RECOVERY_VALID_DAYS} days):</p>
<p><a href="${escapeHtml(input.recoveryUrl)}">Complete subscription payment</a></p>
<p>If you already paid or have questions, reply to this email.</p>
<p>— Track Lucia</p>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
