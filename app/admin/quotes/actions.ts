"use server";

import nodemailer from "nodemailer";

import { getSession } from "@/lib/auth/get-session";
import { buildQuotePdfFromPayload } from "@/lib/billing/quote-build";
import { quoteEmailHtmlFromText } from "@/lib/billing/quote-email-body";
import { parseQuoteEmailRecipientField } from "@/lib/billing/quote-email-recipients";
import { parseQuoteRequestBody } from "@/lib/billing/quote-payload";
import { getSmtpMailFrom, getSmtpTransportOptions } from "@/lib/email/smtp-settings";

export type SendQuoteEmailState = { error?: string; ok?: boolean; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const payloadRaw = String(formData.get("quotePayloadJson") ?? "").trim();
  if (!payloadRaw) {
    return { error: "Quote data is missing. Go back and try again." };
  }

  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(payloadRaw) as unknown;
  } catch {
    return { error: "Quote data is invalid." };
  }

  const parsed = parseQuoteRequestBody(payloadJson);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const built = await buildQuotePdfFromPayload(parsed.payload);
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

  const extras: string[] = [];
  if (ccParsed.emails?.length) extras.push(`cc ${ccParsed.emails.join(", ")}`);
  if (bccParsed.emails?.length) extras.push(`bcc ${bccParsed.emails.join(", ")}`);
  const extraNote = extras.length ? ` (${extras.join("; ")})` : "";

  return { ok: true, message: `Quote emailed to ${to}${extraNote}.` };
}
