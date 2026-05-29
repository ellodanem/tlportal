import "server-only";

import twilio from "twilio";

import { isTwilioWhatsAppConfigured } from "./config";

export function getTwilioSmsFrom(): string | null {
  const explicit = process.env.TWILIO_SMS_FROM?.trim();
  if (explicit) {
    return explicit.startsWith("+") ? explicit : `+${explicit.replace(/\D/g, "")}`;
  }
  const wa = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!wa) return null;
  const digits = wa.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `+${digits}`;
}

export function canSendTwilioAdminSms(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      getTwilioSmsFrom(),
  );
}

export async function sendTwilioAdminSms(
  toE164: string,
  body: string,
): Promise<{ ok: true; messageSid: string } | { ok: false; error: string }> {
  if (!canSendTwilioAdminSms()) {
    return {
      ok: false,
      error: "Twilio SMS is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM or TWILIO_WHATSAPP_FROM).",
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = getTwilioSmsFrom()!;

  const client = twilio(accountSid, authToken);

  try {
    const message = await client.messages.create({
      from,
      to: toE164,
      body: body.slice(0, 1600),
    });
    return { ok: true, messageSid: message.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** True when customer WhatsApp templates can send (separate from SMS-from). */
export function isTwilioConfiguredForBilling(): boolean {
  return isTwilioWhatsAppConfigured();
}
