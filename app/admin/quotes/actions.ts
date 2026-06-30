"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";

import { getSession } from "@/lib/auth/get-session";
import { buildQuotePdfFromPayload } from "@/lib/billing/quote-build";
import { buildQuotePdfFromQuoteId } from "@/lib/billing/quote-from-db";
import { quoteEmailHtmlFromText } from "@/lib/billing/quote-email-body";
import { parseQuoteEmailRecipientField } from "@/lib/billing/quote-email-recipients";
import { parseQuoteRequestBody, type QuoteRequestPayload } from "@/lib/billing/quote-payload";
import { getSmtpMailFrom, getSmtpTransportOptions } from "@/lib/email/smtp-settings";
import { prisma } from "@/lib/db";
import type { CreateQuoteInput } from "@/lib/services/native-quote-service";
import {
  convertQuoteToInvoice,
  createQuote,
  markQuoteSent,
  updateDraftQuote,
} from "@/lib/services/native-quote-service";

export type SendQuoteEmailState = { error?: string; ok?: boolean; message?: string };
export type SaveQuoteState = { error?: string; ok?: boolean; quoteId?: string; next?: string };
export type ConvertQuoteState = { error?: string; ok?: boolean; invoiceId?: string; message?: string };
export type MarkQuoteSentState = { error?: string; ok?: boolean; message?: string; number?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function payloadToCreateInput(payload: QuoteRequestPayload): CreateQuoteInput {
  const billToLines = payload.billToLines ?? [];
  return {
    customerId: payload.customerId,
    billToName: billToLines[0] ?? null,
    billToLines,
    currency: payload.currency,
    issueDate: new Date(`${payload.quoteDate}T12:00:00.000Z`),
    validUntil: new Date(`${payload.validUntil}T12:00:00.000Z`),
    notes: payload.notes,
    lineItems: payload.lineItems.map((line, index) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      sortOrder: index,
    })),
  };
}

function parsePayloadFromForm(formData: FormData): ReturnType<typeof parseQuoteRequestBody> {
  const payloadRaw = String(formData.get("quotePayloadJson") ?? "").trim();
  if (!payloadRaw) {
    return { error: "Quote data is missing." };
  }
  try {
    return parseQuoteRequestBody(JSON.parse(payloadRaw) as unknown);
  } catch {
    return { error: "Quote data is invalid." };
  }
}

export async function saveQuoteAction(_prev: SaveQuoteState, formData: FormData): Promise<SaveQuoteState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const input: CreateQuoteInput = {
    ...payloadToCreateInput(parsed.payload),
    createdById: session.sub,
  };

  try {
    if (quoteId) {
      await updateDraftQuote(quoteId, input);
      revalidatePath("/admin/quotes");
      revalidatePath(`/admin/quotes/${quoteId}`);
      return { ok: true, quoteId, next: `/admin/quotes/${quoteId}` };
    }

    const id = await createQuote(input);
    revalidatePath("/admin/quotes");
    return { ok: true, quoteId: id, next: `/admin/quotes/${id}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save quote." };
  }
}

async function persistDraftAndMarkSent(
  quoteId: string,
  payload: QuoteRequestPayload,
  createdById: string,
): Promise<{ number: string }> {
  const existing = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { status: true },
  });
  if (!existing) {
    throw new Error("Quote not found.");
  }
  if (existing.status === "converted") {
    throw new Error("This quote was already converted to an invoice.");
  }
  if (existing.status === "draft") {
    await updateDraftQuote(quoteId, {
      ...payloadToCreateInput(payload),
      createdById,
    });
  }
  const { number } = await markQuoteSent(quoteId);
  return { number };
}

export async function markQuoteSentAction(
  _prev: MarkQuoteSentState,
  formData: FormData,
): Promise<MarkQuoteSentState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) {
    return { error: "Save the draft first, then mark as sent." };
  }

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  try {
    const { number } = await persistDraftAndMarkSent(quoteId, parsed.payload, session.sub);
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${quoteId}`);
    return {
      ok: true,
      number,
      message: `Quote marked sent as ${number}. Download the PDF or convert to an invoice when ready.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not mark quote as sent." };
  }
}

export async function convertQuoteToInvoiceAction(
  _prev: ConvertQuoteState,
  formData: FormData,
): Promise<ConvertQuoteState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) {
    return { error: "Quote id is missing." };
  }

  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  let dueDate: Date | null = null;
  if (dueRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
      return { error: "Due date must be YYYY-MM-DD." };
    }
    dueDate = new Date(`${dueRaw}T12:00:00.000Z`);
  }

  try {
    const { invoiceId } = await convertQuoteToInvoice(quoteId, {
      dueDate,
      createdById: session.sub,
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${quoteId}`);
    return {
      ok: true,
      invoiceId,
      message: "Draft invoice created — open it under TL invoices to review and send.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not convert quote." };
  }
}

export async function sendQuoteEmailAction(
  _prev: SendQuoteEmailState,
  formData: FormData,
): Promise<SendQuoteEmailState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const to = String(formData.get("to") ?? "").trim();
  if (!to) {
    return { error: "Recipient email is required." };
  }
  if (!EMAIL_RE.test(to)) {
    return { error: "Enter a valid recipient email address." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) {
    return { error: "Subject is required." };
  }

  const bodyText = String(formData.get("bodyText") ?? "").trim();
  if (!bodyText) {
    return { error: "Message body is required." };
  }

  const ccParsed = parseQuoteEmailRecipientField(String(formData.get("cc") ?? ""), to, "Cc");
  if ("error" in ccParsed) {
    return { error: ccParsed.error };
  }

  const bccParsed = parseQuoteEmailRecipientField(String(formData.get("bcc") ?? ""), to, "Bcc");
  if ("error" in bccParsed) {
    return { error: bccParsed.error };
  }

  const quoteId = String(formData.get("quoteId") ?? "").trim();
  let built: Awaited<ReturnType<typeof buildQuotePdfFromPayload>>;

  if (quoteId) {
    const parsed = parsePayloadFromForm(formData);
    if ("error" in parsed) {
      return { error: parsed.error };
    }

    const existing = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!existing) {
      return { error: "Quote not found." };
    }
    if (existing.status === "converted") {
      return { error: "This quote was already converted to an invoice." };
    }

    try {
      await persistDraftAndMarkSent(quoteId, parsed.payload, session.sub);
      built = await buildQuotePdfFromQuoteId(quoteId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not prepare quote for sending." };
    }
  } else {
    const parsed = parsePayloadFromForm(formData);
    if ("error" in parsed) {
      return { error: parsed.error };
    }
    built = await buildQuotePdfFromPayload(parsed.payload);
  }

  if ("error" in built) {
    return { error: built.error };
  }

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
      html: quoteEmailHtmlFromText(bodyText.slice(0, 8000)),
      attachments: [
        {
          filename: built.filename,
          content: built.buffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send email." };
  }

  if (quoteId) {
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${quoteId}`);
  }

  const extras: string[] = [];
  if (ccParsed.emails?.length) extras.push(`cc ${ccParsed.emails.join(", ")}`);
  if (bccParsed.emails?.length) extras.push(`bcc ${bccParsed.emails.join(", ")}`);
  const extraNote = extras.length ? ` (${extras.join("; ")})` : "";

  return { ok: true, message: `Quote emailed to ${to}${extraNote}.` };
}
