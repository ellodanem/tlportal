import "server-only";

import { prisma } from "@/lib/db";
import { autoReceiptEmailPaidAtCutoff, paidAtQualifiesForAutoReceiptEmail } from "@/lib/billing/auto-receipt-email-window";
import { generateAndStorePaidInvoicePdf } from "@/lib/services/billing-paid-pdf-service";
import { autoEmailPaidInvoiceReceiptAfterPayment } from "@/lib/services/billing-paid-receipt-email-service";

export type FulfillPaidReceiptResult = {
  billingInvoiceId: string;
  pdfOk: boolean;
  emailOk: boolean;
  pdfError?: string;
  emailError?: string;
  emailSkipped?: string;
};

export function pendingPaidStripeReceiptWhere(customerId?: string) {
  const cutoff = autoReceiptEmailPaidAtCutoff();
  return {
    ...(customerId ? { customerId } : {}),
    provider: "stripe" as const,
    status: { equals: "paid", mode: "insensitive" as const },
    receiptEmailedAt: null,
    paidAt: { gte: cutoff },
  };
}

/**
 * Generate the TL paid PDF if needed, then auto-email the receipt (Settings + SMTP).
 * Safe to call more than once: PDF store and receipt email are both idempotent.
 */
export async function fulfillPaidStripeInvoiceReceipt(
  billingInvoiceId: string,
): Promise<FulfillPaidReceiptResult> {
  const pdfResult = await generateAndStorePaidInvoicePdf(billingInvoiceId);
  if (!pdfResult.ok) {
    return {
      billingInvoiceId,
      pdfOk: false,
      emailOk: false,
      pdfError: pdfResult.error,
    };
  }

  const paidMeta = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    select: { paidAt: true },
  });
  if (!paidAtQualifiesForAutoReceiptEmail(paidMeta?.paidAt)) {
    return {
      billingInvoiceId,
      pdfOk: true,
      emailOk: true,
      emailSkipped: "Payment is older than the auto-receipt window; email only from Billing if needed.",
    };
  }

  const emailResult = await autoEmailPaidInvoiceReceiptAfterPayment(billingInvoiceId);
  if (!emailResult.ok) {
    return {
      billingInvoiceId,
      pdfOk: true,
      emailOk: false,
      emailError: emailResult.error,
    };
  }
  if ("skipped" in emailResult && emailResult.skipped) {
    return {
      billingInvoiceId,
      pdfOk: true,
      emailOk: true,
      emailSkipped: emailResult.reason,
    };
  }
  return { billingInvoiceId, pdfOk: true, emailOk: true };
}

export async function fulfillPendingPaidStripeReceipts(limit = 25): Promise<{
  processed: number;
  pdfGenerated: number;
  emailed: number;
  errors: { billingInvoiceId: string; message: string }[];
}> {
  const rows = await prisma.billingInvoice.findMany({
    where: pendingPaidStripeReceiptWhere(),
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 50)),
    select: { id: true },
  });

  const errors: { billingInvoiceId: string; message: string }[] = [];
  let pdfGenerated = 0;
  let emailed = 0;

  for (const row of rows) {
    try {
      const before = await prisma.billingInvoice.findUnique({
        where: { id: row.id },
        select: { pdfGeneratedAt: true, receiptEmailedAt: true },
      });
      const result = await fulfillPaidStripeInvoiceReceipt(row.id);
      if (!result.pdfOk) {
        errors.push({ billingInvoiceId: row.id, message: result.pdfError ?? "PDF failed." });
        continue;
      }
      if (!before?.pdfGeneratedAt) pdfGenerated += 1;
      if (!result.emailOk) {
        errors.push({ billingInvoiceId: row.id, message: result.emailError ?? "Email failed." });
        continue;
      }
      if (!result.emailSkipped && !before?.receiptEmailedAt) emailed += 1;
    } catch (e) {
      errors.push({
        billingInvoiceId: row.id,
        message: e instanceof Error ? e.message : "Receipt fulfillment failed.",
      });
    }
  }

  return { processed: rows.length, pdfGenerated, emailed, errors };
}
