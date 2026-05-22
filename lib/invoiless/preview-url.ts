/** Public preview host from create-invoice response; override if Invoiless changes regions. */
export const INVOILESS_INVOICE_PREVIEW_ORIGIN = "https://invoiless.com";

export function invoilessInvoicePreviewUrl(invoilessInvoiceId: string): string {
  return `${INVOILESS_INVOICE_PREVIEW_ORIGIN}/i/${encodeURIComponent(invoilessInvoiceId.trim())}`;
}
