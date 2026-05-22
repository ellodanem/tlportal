import "server-only";

import { prisma } from "@/lib/db";
import { ensureBillingInvoiceDisplayNumber } from "@/lib/billing/invoice-display-number";
import {
  BILLING_PDF_PRIVATE_PREFIX,
  billingPdfBlobPathname,
  stripBillingPdfPrivatePrefix,
} from "@/lib/billing/paid-invoice-blob";
import { buildPaidInvoicePdfBuffer } from "@/lib/billing/paid-invoice-pdf";
import { stripePaymentMethodLabel } from "@/lib/billing/stripe-invoice-for-pdf";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import {
  resolveProposalHeaderLogoStored,
} from "@/lib/proposals/proposal-cover-assets";
import { isStripeConfigured } from "@/lib/services/billing-service";
import { getStripeClient } from "@/lib/stripe/config";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

function pdfAssetOrigin(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://127.0.0.1:3000"
  );
}

export async function loadBillingInvoicePdfBytes(
  pdfStoragePath: string,
): Promise<Buffer | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;

  if (pdfStoragePath.startsWith(BILLING_PDF_PRIVATE_PREFIX)) {
    const { get } = await import("@vercel/blob");
    const blobUrl = stripBillingPdfPrivatePrefix(pdfStoragePath);
    const out = await get(blobUrl, { access: "private", token });
    if (!out || out.statusCode !== 200 || !out.stream) return null;
    const buf = await new Response(out.stream).arrayBuffer();
    return Buffer.from(buf);
  }

  try {
    const res = await fetch(pdfStoragePath, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export type GeneratePaidPdfResult =
  | { ok: true; billingInvoiceId: string; displayNumber: string; skipped?: boolean }
  | { ok: false; error: string };

/**
 * Build and store TL paid receipt PDF (idempotent unless `force`).
 */
export async function generateAndStorePaidInvoicePdf(
  billingInvoiceId: string,
  options?: { force?: boolean },
): Promise<GeneratePaidPdfResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }

  const row = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    include: { customer: true },
  });
  if (!row) {
    return { ok: false, error: "Invoice not found." };
  }
  if (row.provider !== "stripe") {
    return { ok: false, error: "TL paid PDFs are only for Stripe invoices." };
  }
  if (row.status.toLowerCase() !== "paid") {
    return { ok: false, error: "Invoice is not paid yet." };
  }
  if (row.pdfStoragePath && !options?.force) {
    return {
      ok: true,
      billingInvoiceId: row.id,
      displayNumber: row.displayNumber ?? row.externalInvoiceId,
      skipped: true,
    };
  }

  const displayNumber =
    row.displayNumber ?? (await ensureBillingInvoiceDisplayNumber(row.id));
  if (!displayNumber) {
    return { ok: false, error: "Could not allocate TL invoice number." };
  }

  const stripe = getStripeClient();
  const stripeInvoice = await stripe.invoices.retrieve(row.externalInvoiceId, {
    expand: ["lines.data"],
  });

  const paidAt =
    row.paidAt ??
    (stripeInvoice.status_transitions?.paid_at != null
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : new Date());

  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(
    pdfAssetOrigin(),
    resolveProposalHeaderLogoStored(brandingStored),
  );

  const paymentMethodLabel = await stripePaymentMethodLabel(stripe, stripeInvoice);

  const pdfBuffer = buildPaidInvoicePdfBuffer({
    displayNumber,
    providerInvoiceNumber: row.providerInvoiceNumber,
    externalInvoiceId: row.externalInvoiceId,
    currency: row.currency,
    customer: row.customer,
    stripeInvoice,
    paidAt,
    paymentMethodLabel,
    headerLogo,
  });

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN is required to store paid invoice PDFs." };
  }

  const { put } = await import("@vercel/blob");
  const pathname = billingPdfBlobPathname(row.customerId, row.id);
  const blob = await put(pathname, pdfBuffer, {
    access: "private",
    token,
    contentType: "application/pdf",
  });

  const pdfStoragePath = `${BILLING_PDF_PRIVATE_PREFIX}${blob.url}`;
  const now = new Date();

  await prisma.billingInvoice.update({
    where: { id: row.id },
    data: {
      displayNumber,
      pdfStoragePath,
      pdfGeneratedAt: now,
      providerInvoiceNumber: row.providerInvoiceNumber ?? stripeInvoice.number ?? null,
    },
  });

  await recordOperationalEvent({
    category: "billing.synced",
    summary: `TL paid invoice PDF generated — ${displayNumber}`,
    customerId: row.customerId,
    payload: { billingInvoiceId: row.id, displayNumber, force: options?.force ?? false },
  });

  return { ok: true, billingInvoiceId: row.id, displayNumber };
}
