import "server-only";

import twilio from "twilio";

import {
  getTwilioContentSid,
  getTwilioWhatsAppFrom,
  type TwilioWhatsAppReminderTemplateKey,
  type TwilioWhatsAppTemplateKey,
} from "./config";

export type BillingWhatsAppVariables = {
  firstName: string;
  dueDate: string;
  amountDue: string;
  payLink: string;
};

export type SendBillingWhatsAppResult =
  | { ok: true; messageSid: string }
  | { ok: false; error: string; skipped?: boolean };

export async function sendTwilioWhatsAppContent(
  toWhatsApp: string,
  kind: TwilioWhatsAppTemplateKey,
  variables: Record<string, string>,
): Promise<SendBillingWhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not set." };
  }

  const contentSid = getTwilioContentSid(kind);
  if (!contentSid) {
    return { ok: false, error: `No Content SID configured for template kind ${kind}.` };
  }

  const client = twilio(accountSid, authToken);

  try {
    const message = await client.messages.create({
      from: getTwilioWhatsAppFrom(),
      to: toWhatsApp,
      contentSid,
      contentVariables: JSON.stringify(variables),
    });
    return { ok: true, messageSid: message.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function sendBillingWhatsAppTemplate(
  toWhatsApp: string,
  kind: TwilioWhatsAppReminderTemplateKey,
  vars: BillingWhatsAppVariables,
): Promise<SendBillingWhatsAppResult> {
  return sendTwilioWhatsAppContent(toWhatsApp, kind, {
    "1": vars.firstName,
    "2": vars.dueDate,
    "3": vars.amountDue,
    "4": vars.payLink,
  });
}
