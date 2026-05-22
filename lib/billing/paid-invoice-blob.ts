import "server-only";

/** Stored on `BillingInvoice.pdfStoragePath` when the PDF is on a private Vercel Blob. */
export const BILLING_PDF_PRIVATE_PREFIX = "private:" as const;

export function stripBillingPdfPrivatePrefix(stored: string): string {
  return stored.startsWith(BILLING_PDF_PRIVATE_PREFIX)
    ? stored.slice(BILLING_PDF_PRIVATE_PREFIX.length)
    : stored;
}

export function billingPdfBlobPathname(customerId: string, billingInvoiceId: string): string {
  return `billing-invoices/${customerId}/${billingInvoiceId}.pdf`;
}
