/** Auto-email receipts only for recent payments (missed-webhook catch-up). Older paid invoices stay silent unless staff emails from Billing. */
export const AUTO_RECEIPT_EMAIL_MAX_AGE_DAYS = 7;

export const AUTO_RECEIPT_EMAIL_MAX_AGE_MS = AUTO_RECEIPT_EMAIL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export function autoReceiptEmailPaidAtCutoff(now = new Date()): Date {
  return new Date(now.getTime() - AUTO_RECEIPT_EMAIL_MAX_AGE_MS);
}

export function paidAtQualifiesForAutoReceiptEmail(
  paidAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!paidAt) return false;
  return paidAt.getTime() >= autoReceiptEmailPaidAtCutoff(now).getTime();
}
