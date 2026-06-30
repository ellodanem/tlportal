import "server-only";

import { DEFAULT_PORTAL_TIMEZONE } from "@/lib/portal/timezone-options";

export type TwilioWhatsAppReminderTemplateKey =
  | "due_5d"
  | "due_3d"
  | "due_0d"
  | "overdue_3d"
  | "overdue_5d";

export type TwilioWhatsAppCustomerTemplateKey =
  | "stripe_payment_link"
  | "stripe_payment_link_resend"
  | "invoice_new";

export type TwilioWhatsAppTemplateKey =
  | TwilioWhatsAppReminderTemplateKey
  | TwilioWhatsAppCustomerTemplateKey;

const TEMPLATE_ENV: Record<TwilioWhatsAppTemplateKey, string> = {
  due_5d: "TWILIO_WA_TEMPLATE_DUE_5_DAYS",
  due_3d: "TWILIO_WA_TEMPLATE_DUE_3_DAYS",
  due_0d: "TWILIO_WA_TEMPLATE_DUE_TODAY",
  overdue_3d: "TWILIO_WA_TEMPLATE_OVERDUE_3_DAYS",
  overdue_5d: "TWILIO_WA_TEMPLATE_OVERDUE_5_DAYS",
  stripe_payment_link: "TWILIO_WA_TEMPLATE_STRIPE_PAYMENT_LINK",
  stripe_payment_link_resend: "TWILIO_WA_TEMPLATE_STRIPE_PAYMENT_LINK_RESEND",
  invoice_new: "TWILIO_WA_TEMPLATE_INVOICE_NEW",
};

export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim(),
  );
}

export function getTwilioWhatsAppFrom(): string {
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!from) {
    throw new Error("TWILIO_WHATSAPP_FROM is not set.");
  }
  return from.toLowerCase().startsWith("whatsapp:") ? from : `whatsapp:${from}`;
}

export function getTwilioContentSid(kind: TwilioWhatsAppTemplateKey): string | null {
  const primary = process.env[TEMPLATE_ENV[kind]]?.trim();
  if (primary) return primary;

  if (kind === "overdue_3d" || kind === "overdue_5d") {
    return process.env.TWILIO_WA_TEMPLATE_OVERDUE?.trim() || null;
  }
  return null;
}

/** @deprecated Use getPortalTimezone() from @/lib/portal/timezone-settings */
export function billingReminderTimezone(): string {
  return process.env.BILLING_REMINDER_TIMEZONE?.trim() || DEFAULT_PORTAL_TIMEZONE;
}

/** When true, send WhatsApp even if no pay URL ({{4}} = mailto support). Default: skip. */
export function allowWhatsAppWithoutPayLink(): boolean {
  const v = process.env.TWILIO_WA_ALLOW_SEND_WITHOUT_PAY_LINK?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
