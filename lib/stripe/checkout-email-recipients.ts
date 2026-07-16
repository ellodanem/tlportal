import "server-only";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_CHECKOUT_EMAIL_BCC = "ellodaneenterprises@gmail.com";

export function getCheckoutEmailBcc(): string[] | undefined {
  const raw = process.env.STRIPE_CHECKOUT_EMAIL_BCC?.trim() || DEFAULT_CHECKOUT_EMAIL_BCC;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => EMAIL_RE.test(s));

  return parts.length > 0 ? Array.from(new Set(parts)) : undefined;
}

