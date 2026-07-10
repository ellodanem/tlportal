import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toSmsAddress } from "@/lib/twilio/phone";

export const WHATSAPP_SESSION_HOURS = 24;

/** Normalize Twilio `whatsapp:+1…` or raw phone to E.164 `+…`. */
export function normalizeWhatsAppPhoneE164(raw: string | null | undefined): string | null {
  return toSmsAddress(raw);
}

export function isWhatsAppSessionOpen(lastInboundAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < WHATSAPP_SESSION_HOURS * 60 * 60 * 1000;
}

async function findCustomerIdByPhone(phoneE164: string): Promise<string | null> {
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const customers = await prisma.customer.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
    take: 5000,
  });

  for (const c of customers) {
    const normalized = normalizeWhatsAppPhoneE164(c.phone);
    if (normalized && normalized.replace(/\D/g, "") === digits) {
      return c.id;
    }
  }
  return null;
}

export async function getOrCreateWhatsAppConversation(phoneE164: string) {
  const existing = await prisma.whatsAppConversation.findUnique({ where: { phoneE164 } });
  if (existing) {
    if (!existing.customerId) {
      const customerId = await findCustomerIdByPhone(phoneE164);
      if (customerId) {
        return prisma.whatsAppConversation.update({
          where: { id: existing.id },
          data: { customerId },
        });
      }
    }
    return existing;
  }

  const customerId = await findCustomerIdByPhone(phoneE164);
  return prisma.whatsAppConversation.create({
    data: { phoneE164, customerId },
  });
}

export async function ingestInboundWhatsAppMessage(input: {
  from: string;
  body: string | null;
  messageSid: string;
  status?: string | null;
  raw: Record<string, string>;
}): Promise<{ ok: true; conversationId: string; duplicate?: boolean } | { ok: false; error: string }> {
  const phoneE164 = normalizeWhatsAppPhoneE164(input.from);
  if (!phoneE164) {
    return { ok: false, error: "Could not normalize sender phone." };
  }

  const existingMsg = await prisma.whatsAppMessage.findUnique({
    where: { twilioMessageSid: input.messageSid },
    select: { id: true, conversationId: true },
  });
  if (existingMsg) {
    return { ok: true, conversationId: existingMsg.conversationId, duplicate: true };
  }

  const conversation = await getOrCreateWhatsAppConversation(phoneE164);
  const now = new Date();

  await prisma.$transaction([
    prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "inbound",
        body: input.body?.trim() || null,
        twilioMessageSid: input.messageSid,
        status: input.status ?? "received",
        kind: "inbound",
        occurredAt: now,
        rawPayload: input.raw as Prisma.InputJsonValue,
      },
    }),
    prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        lastInboundAt: now,
        unreadCount: { increment: 1 },
      },
    }),
  ]);

  return { ok: true, conversationId: conversation.id };
}

export async function recordOutboundWhatsAppMessage(input: {
  phoneE164: string;
  body: string | null;
  messageSid: string;
  actorUserId?: string | null;
  kind?: "freeform" | "template";
  status?: string | null;
}): Promise<void> {
  const conversation = await getOrCreateWhatsAppConversation(input.phoneE164);
  const now = new Date();

  const existing = await prisma.whatsAppMessage.findUnique({
    where: { twilioMessageSid: input.messageSid },
    select: { id: true },
  });
  if (existing) return;

  await prisma.$transaction([
    prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        body: input.body,
        twilioMessageSid: input.messageSid,
        status: input.status ?? "sent",
        actorUserId: input.actorUserId ?? null,
        kind: input.kind ?? "freeform",
        occurredAt: now,
      },
    }),
    prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    }),
  ]);
}

export async function getWhatsAppConversationForCustomer(customerId: string) {
  return prisma.whatsAppConversation.findFirst({
    where: { customerId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { occurredAt: "asc" },
        take: 200,
      },
    },
  });
}

export async function markWhatsAppConversationRead(conversationId: string): Promise<void> {
  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });
}

export async function getCustomerWhatsAppSession(customerId: string): Promise<{
  open: boolean;
  lastInboundAt: Date | null;
  phoneE164: string | null;
}> {
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { customerId },
    orderBy: { lastMessageAt: "desc" },
    select: { lastInboundAt: true, phoneE164: true },
  });
  return {
    open: isWhatsAppSessionOpen(conversation?.lastInboundAt ?? null),
    lastInboundAt: conversation?.lastInboundAt ?? null,
    phoneE164: conversation?.phoneE164 ?? null,
  };
}
