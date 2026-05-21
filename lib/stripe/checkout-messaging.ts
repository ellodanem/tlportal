/** User-facing copy for Stripe Checkout payment links (initial + recovery). */

export const CHECKOUT_LINK_VALID_HOURS = 24;

export const CHECKOUT_RECOVERY_VALID_DAYS = 30;

export function checkoutInitialLinkNotice(): string {
  return `This payment link is valid for about ${CHECKOUT_LINK_VALID_HOURS} hours. If it expires before you pay, we can send a follow-up link (valid up to ${CHECKOUT_RECOVERY_VALID_DAYS} days).`;
}

export function checkoutInitialEmailBody(input: {
  greetingName: string;
  paymentUrl: string;
}): { text: string; html: string } {
  const notice = checkoutInitialLinkNotice();
  const text = `Hello ${input.greetingName},

Please use the link below to enter your card and start your subscription. Stripe will bill your card automatically on each renewal.

${input.paymentUrl}

${notice}

If you have questions, reply to this email.

— Track Lucia`;

  const html = `<p>Hello ${escapeHtml(input.greetingName)},</p>
<p>Please use the link below to enter your card and start your subscription. Stripe will bill your card automatically on each renewal.</p>
<p><a href="${escapeHtml(input.paymentUrl)}">Complete subscription payment</a></p>
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
