"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { getSession } from "@/lib/auth/get-session";
import { invoiceEmailHtmlFromText } from "@/lib/billing/invoice-email-body";
import {
  getQuickWhatsAppTemplate,
  isQuickWhatsAppTemplateKind,
} from "@/lib/communications/quick-send-whatsapp-templates";
import {
  getCustomerWhatsAppSession,
  recordOutboundWhatsAppMessage,
} from "@/lib/communications/whatsapp-conversation-service";
import { prisma } from "@/lib/db";
import { sendAppEmail } from "@/lib/email/send-mail";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { canSendTwilioAdminSms, sendTwilioAdminSms } from "@/lib/twilio/admin-sms";
import { getTwilioContentSid, isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { toSmsAddress, toWhatsAppAddress } from "@/lib/twilio/phone";
import { sendTwilioWhatsAppContent, sendTwilioWhatsAppFreeform } from "@/lib/twilio/whatsapp-send";

export type QuickSendState = {
  error: string | null;
  ok?: boolean;
  message?: string;
};

export async function sendQuickEmailAction(
  _prev: QuickSendState,
  formData: FormData,
): Promise<QuickSendState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!customerId) return { error: "Choose a customer." };
  if (!subject) return { error: "Enter a subject." };
  if (!body) return { error: "Enter a message." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, email: true, company: true, firstName: true, lastName: true },
  });
  const email = customer?.email?.trim();
  if (!customer || !email) {
    return { error: "That customer has no email on file." };
  }

  const sent = await sendAppEmail({
    to: email,
    subject,
    text: body,
    html: invoiceEmailHtmlFromText(body),
  });
  if (!sent.ok) {
    return { error: sent.error };
  }

  await recordOperationalEvent({
    category: "communication.message_sent",
    customerId: customer.id,
    actorUserId: session.sub,
    summary: `Email sent to ${email}: ${subject}`,
    payload: { channel: "email", to: email, subject },
  });

  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath("/admin/message-templates");
  return {
    error: null,
    ok: true,
    message: `Email sent to ${customerDisplayName(customer)} (${email}).`,
  };
}

export async function sendQuickWhatsAppAction(
  _prev: QuickSendState,
  formData: FormData,
): Promise<QuickSendState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  if (!isTwilioWhatsAppConfigured()) {
    return { error: "Twilio WhatsApp is not configured." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const kindRaw = String(formData.get("templateKind") ?? "").trim();
  if (!customerId) return { error: "Choose a customer." };
  if (!isQuickWhatsAppTemplateKind(kindRaw)) {
    return { error: "Choose an approved WhatsApp template." };
  }

  const template = getQuickWhatsAppTemplate(kindRaw);
  if (!template) return { error: "Unknown WhatsApp template." };
  if (!getTwilioContentSid(kindRaw)) {
    return { error: `No Content SID configured for ${template.name}.` };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, company: true, firstName: true, lastName: true },
  });
  const to = customer ? toWhatsAppAddress(customer.phone) : null;
  if (!customer || !to) {
    return { error: "That customer has no valid phone for WhatsApp." };
  }

  const variables: Record<string, string> = {};
  for (const field of template.fields) {
    const value = String(formData.get(`var_${field.key}`) ?? "").trim();
    if (!value) {
      return { error: `Fill in “${field.label}”.` };
    }
    variables[field.key] = value;
  }

  const result = await sendTwilioWhatsAppContent(to, kindRaw, variables);
  if (!result.ok) {
    return { error: result.error };
  }

  const phoneE164 = toSmsAddress(customer.phone);
  if (phoneE164) {
    await recordOutboundWhatsAppMessage({
      phoneE164,
      body: `[template:${kindRaw}] ${Object.values(variables).join(" · ")}`,
      messageSid: result.messageSid,
      actorUserId: session.sub,
      kind: "template",
    });
  }

  await recordOperationalEvent({
    category: "communication.message_sent",
    customerId: customer.id,
    actorUserId: session.sub,
    summary: `WhatsApp (${template.name}) sent to ${customer.phone}`,
    payload: {
      channel: "whatsapp",
      to: customer.phone,
      templateKind: kindRaw,
      messageSid: result.messageSid,
      variables,
    },
  });

  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath(`/admin/customers/${customer.id}/messages`);
  revalidatePath("/admin/message-templates");
  return {
    error: null,
    ok: true,
    message: `WhatsApp sent to ${customerDisplayName(customer)} (${customer.phone}).`,
  };
}

export async function sendQuickWhatsAppFreeformAction(
  _prev: QuickSendState,
  formData: FormData,
): Promise<QuickSendState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  if (!isTwilioWhatsAppConfigured()) {
    return { error: "Twilio WhatsApp is not configured." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!customerId) return { error: "Choose a customer." };
  if (!body) return { error: "Enter a message." };

  const sessionInfo = await getCustomerWhatsAppSession(customerId);
  if (!sessionInfo.open) {
    return {
      error: "The 24-hour WhatsApp window is closed for this customer. Use an approved template instead.",
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, company: true, firstName: true, lastName: true },
  });
  const to = customer ? toWhatsAppAddress(customer.phone) : null;
  if (!customer || !to) {
    return { error: "That customer has no valid phone for WhatsApp." };
  }

  const result = await sendTwilioWhatsAppFreeform(to, body);
  if (!result.ok) {
    return { error: result.error };
  }

  const phoneE164 = toSmsAddress(customer.phone) ?? sessionInfo.phoneE164;
  if (phoneE164) {
    await recordOutboundWhatsAppMessage({
      phoneE164,
      body,
      messageSid: result.messageSid,
      actorUserId: session.sub,
      kind: "freeform",
    });
  }

  await recordOperationalEvent({
    category: "communication.message_sent",
    customerId: customer.id,
    actorUserId: session.sub,
    summary: `WhatsApp free-form sent to ${customer.phone}`,
    payload: { channel: "whatsapp", kind: "freeform", to: customer.phone, messageSid: result.messageSid },
  });

  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath(`/admin/customers/${customer.id}/messages`);
  revalidatePath("/admin/message-templates");
  return {
    error: null,
    ok: true,
    message: `WhatsApp sent to ${customerDisplayName(customer)} (${customer.phone}).`,
  };
}

export async function sendQuickSmsAction(
  _prev: QuickSendState,
  formData: FormData,
): Promise<QuickSendState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  if (!canSendTwilioAdminSms()) {
    return { error: "Twilio SMS is not configured." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!customerId) return { error: "Choose a customer." };
  if (!body) return { error: "Enter a message." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, company: true, firstName: true, lastName: true },
  });
  const to = customer ? toSmsAddress(customer.phone) : null;
  if (!customer || !to) {
    return { error: "That customer has no valid phone for SMS." };
  }

  const result = await sendTwilioAdminSms(to, body);
  if (!result.ok) {
    return { error: result.error };
  }

  await recordOperationalEvent({
    category: "communication.message_sent",
    customerId: customer.id,
    actorUserId: session.sub,
    summary: `SMS sent to ${customer.phone}`,
    payload: {
      channel: "sms",
      to: customer.phone,
      messageSid: result.messageSid,
      bodyPreview: body.slice(0, 200),
      ref: randomUUID(),
    },
  });

  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath("/admin/message-templates");
  return {
    error: null,
    ok: true,
    message: `SMS sent to ${customerDisplayName(customer)} (${customer.phone}).`,
  };
}
