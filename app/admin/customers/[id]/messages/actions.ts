"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import {
  getWhatsAppConversationForCustomer,
  isWhatsAppSessionOpen,
  markWhatsAppConversationRead,
  recordOutboundWhatsAppMessage,
} from "@/lib/communications/whatsapp-conversation-service";
import { prisma } from "@/lib/db";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { toWhatsAppAddress } from "@/lib/twilio/phone";
import { sendTwilioWhatsAppFreeform } from "@/lib/twilio/whatsapp-send";

export type WhatsAppReplyState = {
  error: string | null;
  ok?: boolean;
};

export async function sendCustomerWhatsAppReplyAction(
  _prev: WhatsAppReplyState,
  formData: FormData,
): Promise<WhatsAppReplyState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const customerId = String(formData.get("customerId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!customerId) return { error: "Missing customer." };
  if (!body) return { error: "Enter a message." };

  const conversation = await getWhatsAppConversationForCustomer(customerId);
  if (!conversation) {
    return { error: "No WhatsApp conversation for this customer yet." };
  }
  if (!isWhatsAppSessionOpen(conversation.lastInboundAt)) {
    return {
      error: "The 24-hour WhatsApp window is closed. Use an approved template from Message templates.",
    };
  }

  const to = toWhatsAppAddress(conversation.phoneE164);
  if (!to) return { error: "Invalid conversation phone number." };

  const sent = await sendTwilioWhatsAppFreeform(to, body);
  if (!sent.ok) return { error: sent.error };

  await recordOutboundWhatsAppMessage({
    phoneE164: conversation.phoneE164,
    body,
    messageSid: sent.messageSid,
    actorUserId: session.sub,
    kind: "freeform",
  });

  await recordOperationalEvent({
    category: "communication.message_sent",
    customerId,
    actorUserId: session.sub,
    summary: `WhatsApp reply sent to ${conversation.phoneE164}`,
    payload: { channel: "whatsapp", kind: "freeform", messageSid: sent.messageSid },
  });

  revalidatePath(`/admin/customers/${customerId}/messages`);
  revalidatePath(`/admin/customers/${customerId}`);
  return { error: null, ok: true };
}

export async function markCustomerWhatsAppReadAction(customerId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { customerId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (conversation) {
    await markWhatsAppConversationRead(conversation.id);
  }
}
