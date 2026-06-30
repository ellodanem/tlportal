import "server-only";

import nodemailer from "nodemailer";

import { buildInvoicePdfFromInvoiceId } from "@/lib/billing/invoice-from-db";
import {
  defaultInvoiceEmailBody,
  defaultInvoiceEmailSubject,
  invoiceEmailHtmlFromText,
} from "@/lib/billing/invoice-email-body";
import { DEFAULT_QUOTE_EMAIL_BCC } from "@/lib/billing/quote-email-recipients";
import { getSmtpMailFrom, getSmtpTransportOptions } from "@/lib/email/smtp-settings";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/stripe/app-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendNativeInvoiceEmailInput = {
  invoiceId: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyText?: string;
  greetingName?: string;
};

export async function sendNativeInvoiceEmail(
  input: SendNativeInvoiceEmailInput,
): Promise<{ ok: true } | { error: string }> {
  const to = input.to.trim();
  if (!to || !EMAIL_RE.test(to)) return { error: "Invalid recipient email." };

  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      number: true,
      dueDate: true,
      amountDue: true,
      currency: true,
      publicToken: true,
      billToName: true,
      billToLines: true,
    },
  });
  if (!invoice) return { error: "Invoice not found." };

  const built = await buildInvoicePdfFromInvoiceId(input.invoiceId);
  if ("error" in built) return { error: built.error };

  const transportOpts = await getSmtpTransportOptions();
  const from = await getSmtpMailFrom();
  if (!transportOpts || !from) {
    return { error: "SMTP is not configured." };
  }

  const invoiceNumber = invoice.number ?? "Invoice";
  const payUrl = invoice.publicToken ? `${getAppBaseUrl()}/pay/i/${invoice.publicToken}` : null;
  const greetingName =
    input.greetingName?.trim() ||
    invoice.billToName?.trim() ||
    (invoice.billToLines.length ? invoice.billToLines[0] : "there");

  const draft = defaultInvoiceEmailBody({
    greetingName,
    invoiceNumber,
    dueDate: invoice.dueDate,
    amountDue: Number(invoice.amountDue),
    currency: invoice.currency,
    payUrl,
  });

  const subject = (input.subject ?? defaultInvoiceEmailSubject(invoiceNumber)).slice(0, 200);
  const bodyText = (input.bodyText ?? draft.text).slice(0, 8000);
  const cc = input.cc?.length ? input.cc : undefined;
  const bcc = input.bcc?.length ? input.bcc : [DEFAULT_QUOTE_EMAIL_BCC];

  try {
    const transporter = nodemailer.createTransport(transportOpts);
    await transporter.sendMail({
      from: from.name ? `"${from.name}" <${from.address}>` : from.address,
      to,
      cc,
      bcc,
      subject,
      text: bodyText,
      html: invoiceEmailHtmlFromText(bodyText),
      attachments: [{ filename: built.filename, content: built.buffer, contentType: "application/pdf" }],
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send email." };
  }
}
