import "server-only";

import nodemailer from "nodemailer";

import { isAutoEmailPaidStripeReceiptsEnabled } from "@/lib/billing/auto-receipt-email-settings";
import { parseInvoiceEmailCcBccList } from "@/lib/billing/invoice-email-recipients";
import { prisma } from "@/lib/db";
import { getSmtpMailFrom, getSmtpTransportOptions } from "@/lib/email/smtp-settings";
import {
  generateAndStorePaidInvoicePdf,
  loadBillingInvoicePdfBytes,
} from "@/lib/services/billing-paid-pdf-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

export type SendPaidReceiptEmailResult =
  | { ok: true; sentTo: string; displayNumber: string; alreadySent?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

function customerGreetingName(customer: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "there"
  );
}

function paidReceiptEmailBody(greeting: string, displayNumber: string): { text: string; html: string } {
  const text = `Hi ${greeting},

Please find your paid invoice receipt attached (${displayNumber}).

Thank you,
Track Lucia`;

  const html = `<p>Hi ${escapeHtml(greeting)},</p><p>Please find your paid invoice receipt attached (<strong>${escapeHtml(displayNumber)}</strong>).</p><p>Thank you,<br>Track Lucia</p>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Email TL paid receipt PDF to the customer. Idempotent unless `force`.
 * Webhook auto-send respects Admin → Settings; manual sends always attempt delivery.
 */
export async function sendPaidInvoiceReceiptEmail(
  billingInvoiceId: string,
  options?: { force?: boolean; source?: "webhook" | "manual"; actorUserId?: string | null },
): Promise<SendPaidReceiptEmailResult> {
  const source = options?.source ?? "manual";

  if (source === "webhook") {
    const enabled = await isAutoEmailPaidStripeReceiptsEnabled();
    if (!enabled) {
      return { ok: true, skipped: true, reason: "Auto-email paid receipts is disabled in Settings." };
    }
  }

  const row = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    include: {
      customer: {
        select: {
          id: true,
          email: true,
          company: true,
          firstName: true,
          lastName: true,
          invoiceCc: true,
          invoiceBcc: true,
        },
      },
    },
  });
  if (!row) {
    return { ok: false, error: "Invoice not found." };
  }
  if (row.status.toLowerCase() !== "paid") {
    return { ok: false, error: "Only paid invoices can be emailed." };
  }
  if (row.receiptEmailedAt && !options?.force) {
    return {
      ok: true,
      skipped: true,
      reason: `Receipt already emailed on ${row.receiptEmailedAt.toISOString()}.`,
    };
  }

  const to = row.customer.email?.trim();
  if (!to) {
    return { ok: true, skipped: true, reason: "Customer has no email address." };
  }

  if (!row.pdfStoragePath) {
    const gen = await generateAndStorePaidInvoicePdf(billingInvoiceId);
    if (!gen.ok) {
      return { ok: false, error: gen.error };
    }
  }

  const refreshed = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    select: { displayNumber: true, pdfStoragePath: true },
  });
  if (!refreshed?.pdfStoragePath) {
    return { ok: false, error: "PDF is not available." };
  }

  const pdfBytes = await loadBillingInvoicePdfBytes(refreshed.pdfStoragePath);
  if (!pdfBytes) {
    return { ok: false, error: "Could not load PDF from storage." };
  }

  const transportOpts = await getSmtpTransportOptions();
  const from = await getSmtpMailFrom();
  if (!transportOpts || !from) {
    return { ok: false, error: "SMTP is not configured in Admin → Settings." };
  }

  const displayNumber = refreshed.displayNumber ?? "invoice";
  const greeting = customerGreetingName(row.customer);
  const { text, html } = paidReceiptEmailBody(greeting, displayNumber);
  const cc = parseInvoiceEmailCcBccList(row.customer.invoiceCc, to);
  const bcc = parseInvoiceEmailCcBccList(row.customer.invoiceBcc, to);
  const filename = `${displayNumber.replace(/[^\w-]+/g, "-")}.pdf`;

  try {
    const transporter = nodemailer.createTransport(transportOpts);
    await transporter.sendMail({
      from: from.name ? `"${from.name}" <${from.address}>` : from.address,
      to,
      cc: cc?.length ? cc : undefined,
      bcc: bcc?.length ? bcc : undefined,
      subject: `Receipt ${displayNumber} — Track Lucia`,
      text,
      html,
      attachments: [
        {
          filename,
          content: pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }

  const now = new Date();
  await prisma.billingInvoice.update({
    where: { id: billingInvoiceId },
    data: { receiptEmailedAt: now },
  });

  await recordOperationalEvent({
    category: "billing.synced",
    summary: `Paid receipt emailed — ${displayNumber}`,
    customerId: row.customer.id,
    actorUserId: options?.actorUserId ?? undefined,
    payload: {
      billingInvoiceId,
      displayNumber,
      to,
      cc: cc ?? [],
      source,
    },
  });

  return { ok: true, sentTo: to, displayNumber };
}

/**
 * Auto-email after Stripe `invoice.paid` when PDF generation succeeds.
 */
export async function autoEmailPaidInvoiceReceiptAfterPayment(
  billingInvoiceId: string,
): Promise<SendPaidReceiptEmailResult> {
  return sendPaidInvoiceReceiptEmail(billingInvoiceId, { source: "webhook" });
}
