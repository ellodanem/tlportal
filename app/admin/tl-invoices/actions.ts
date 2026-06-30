"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";

import { getSession } from "@/lib/auth/get-session";
import { buildInvoicePdfFromInvoiceId } from "@/lib/billing/invoice-from-db";
import { invoiceEmailHtmlFromText } from "@/lib/billing/invoice-email-body";
import { parseInvoiceRequestBody, type InvoiceRequestPayload } from "@/lib/billing/invoice-payload";
import { parseQuoteEmailRecipientField } from "@/lib/billing/quote-email-recipients";
import { getSmtpMailFrom, getSmtpTransportOptions } from "@/lib/email/smtp-settings";
import { prisma } from "@/lib/db";
import type { CreateDraftInvoiceInput } from "@/lib/services/native-invoice-service";
import {
  createDraftInvoice,
  finalizeAndSendInvoice,
  recordInvoicePayment,
  updateDraftInvoice,
  voidInvoice,
} from "@/lib/services/native-invoice-service";

export type SaveInvoiceState = { error?: string; ok?: boolean; invoiceId?: string; next?: string };
export type SendInvoiceEmailState = { error?: string; ok?: boolean; message?: string };
export type MarkInvoiceSentState = { error?: string; ok?: boolean; message?: string; number?: string };
export type RecordPaymentState = { error?: string; ok?: boolean; message?: string };
export type VoidInvoiceState = { error?: string; ok?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function payloadToCreateInput(payload: InvoiceRequestPayload): CreateDraftInvoiceInput {
  const billToLines = payload.billToLines ?? [];
  return {
    customerId: payload.customerId,
    billToName: billToLines[0] ?? null,
    billToLines,
    currency: payload.currency,
    issueDate: new Date(`${payload.issueDate}T12:00:00.000Z`),
    dueDate: payload.dueDate ? new Date(`${payload.dueDate}T12:00:00.000Z`) : null,
    notes: payload.notes,
    paymentInstructions: payload.paymentInstructions,
    lineItems: payload.lineItems.map((line, index) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      sortOrder: index,
    })),
  };
}

function parsePayloadFromForm(formData: FormData): ReturnType<typeof parseInvoiceRequestBody> {
  const payloadRaw = String(formData.get("invoicePayloadJson") ?? "").trim();
  if (!payloadRaw) return { error: "Invoice data is missing." };
  try {
    return parseInvoiceRequestBody(JSON.parse(payloadRaw) as unknown);
  } catch {
    return { error: "Invoice data is invalid." };
  }
}

export async function saveInvoiceAction(_prev: SaveInvoiceState, formData: FormData): Promise<SaveInvoiceState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const input: CreateDraftInvoiceInput = {
    ...payloadToCreateInput(parsed.payload),
    createdById: session.sub,
  };

  try {
    if (invoiceId) {
      await updateDraftInvoice(invoiceId, input);
      revalidatePath("/admin/tl-invoices");
      revalidatePath(`/admin/tl-invoices/${invoiceId}`);
      return { ok: true, invoiceId, next: `/admin/tl-invoices/${invoiceId}` };
    }
    const id = await createDraftInvoice(input);
    revalidatePath("/admin/tl-invoices");
    return { ok: true, invoiceId: id, next: `/admin/tl-invoices/${id}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save invoice." };
  }
}

async function persistDraftAndMarkSent(
  invoiceId: string,
  payload: InvoiceRequestPayload,
  createdById: string,
): Promise<{ number: string }> {
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  if (!existing) {
    throw new Error("Invoice not found.");
  }
  if (existing.status === "void" || existing.status === "written_off") {
    throw new Error("This invoice cannot be sent.");
  }
  if (existing.status === "draft") {
    await updateDraftInvoice(invoiceId, {
      ...payloadToCreateInput(payload),
      createdById,
    });
  }
  const { number } = await finalizeAndSendInvoice(invoiceId);
  return { number };
}

export async function markInvoiceSentAction(
  _prev: MarkInvoiceSentState,
  formData: FormData,
): Promise<MarkInvoiceSentState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) {
    return { error: "Save the draft first, then mark as sent." };
  }

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  try {
    const { number } = await persistDraftAndMarkSent(invoiceId, parsed.payload, session.sub);
    revalidatePath("/admin/tl-invoices");
    revalidatePath(`/admin/tl-invoices/${invoiceId}`);
    return {
      ok: true,
      number,
      message: `Invoice marked sent as ${number}. Download the PDF or email it when ready.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not mark invoice as sent." };
  }
}

export async function sendInvoiceEmailAction(
  _prev: SendInvoiceEmailState,
  formData: FormData,
): Promise<SendInvoiceEmailState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) return { error: "Save the invoice before sending." };

  const to = String(formData.get("to") ?? "").trim();
  if (!to || !EMAIL_RE.test(to)) return { error: "Enter a valid recipient email." };

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  if (!subject || !bodyText) return { error: "Subject and message are required." };

  const ccParsed = parseQuoteEmailRecipientField(String(formData.get("cc") ?? ""), to, "Cc");
  if ("error" in ccParsed) return { error: ccParsed.error };
  const bccParsed = parseQuoteEmailRecipientField(String(formData.get("bcc") ?? ""), to, "Bcc");
  if ("error" in bccParsed) return { error: bccParsed.error };

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  if (!existing) return { error: "Invoice not found." };
  if (existing.status === "void" || existing.status === "written_off") {
    return { error: "This invoice cannot be sent." };
  }

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  try {
    if (existing.status === "draft") {
      await persistDraftAndMarkSent(invoiceId, parsed.payload, session.sub);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not finalize invoice." };
  }

  const built = await buildInvoicePdfFromInvoiceId(invoiceId);
  if ("error" in built) return { error: built.error };

  const transportOpts = await getSmtpTransportOptions();
  const from = await getSmtpMailFrom();
  if (!transportOpts || !from) {
    return { error: "SMTP is not configured. Set mail under Admin → Settings." };
  }

  try {
    const transporter = nodemailer.createTransport(transportOpts);
    await transporter.sendMail({
      from: from.name ? `"${from.name}" <${from.address}>` : from.address,
      to,
      cc: ccParsed.emails,
      bcc: bccParsed.emails,
      subject: subject.slice(0, 200),
      text: bodyText.slice(0, 8000),
      html: invoiceEmailHtmlFromText(bodyText.slice(0, 8000)),
      attachments: [{ filename: built.filename, content: built.buffer, contentType: "application/pdf" }],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send email." };
  }

  revalidatePath("/admin/tl-invoices");
  revalidatePath(`/admin/tl-invoices/${invoiceId}`);
  return { ok: true, message: `Invoice emailed to ${to}.` };
}

export async function recordPaymentAction(
  _prev: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const amount = Number(formData.get("amount") ?? "");
  const method = String(formData.get("method") ?? "cash").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!invoiceId) return { error: "Invoice id is missing." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid payment amount." };

  const allowed = new Set(["cash", "bank_transfer", "cheque", "card_manual", "other"]);
  if (!allowed.has(method)) return { error: "Invalid payment method." };

  try {
    const result = await recordInvoicePayment({
      invoiceId,
      amount,
      method: method as "cash" | "bank_transfer" | "cheque" | "card_manual" | "other",
      reference,
      notes,
      recordedById: session.sub,
    });
    revalidatePath("/admin/tl-invoices");
    revalidatePath(`/admin/tl-invoices/${invoiceId}`);
    return {
      ok: true,
      message:
        result.status === "paid"
          ? "Payment recorded — invoice is fully paid."
          : `Payment recorded — ${result.amountDue.toFixed(2)} still due.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not record payment." };
  }
}

export async function voidInvoiceAction(_prev: VoidInvoiceState, formData: FormData): Promise<VoidInvoiceState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) return { error: "Invoice id is missing." };

  try {
    await voidInvoice(invoiceId);
    revalidatePath("/admin/tl-invoices");
    revalidatePath(`/admin/tl-invoices/${invoiceId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not void invoice." };
  }
}
