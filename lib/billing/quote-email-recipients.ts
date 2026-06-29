import { parseInvoiceEmailCcBccList } from "@/lib/billing/invoice-email-recipients";

export const DEFAULT_QUOTE_EMAIL_BCC = "dane.elrus1@gmail.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseQuoteEmailRecipientField(
  raw: string | null | undefined,
  primaryEmail: string,
  fieldLabel: string,
): { emails: string[] | undefined } | { error: string } {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { emails: undefined };
  }

  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!EMAIL_RE.test(part)) {
      return { error: `${fieldLabel}: invalid address “${part}”.` };
    }
  }

  const emails = parseInvoiceEmailCcBccList(trimmed, primaryEmail);
  return { emails };
}
