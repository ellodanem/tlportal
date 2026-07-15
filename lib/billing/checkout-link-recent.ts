import "server-only";

import { CHECKOUT_LINK_VALID_HOURS } from "@/lib/stripe/checkout-messaging";
import { prisma } from "@/lib/db";

const MS_PER_HOUR = 3_600_000;

export async function findRecentCheckoutLinkSentAt(customerId: string): Promise<Date | null> {
  const since = new Date(Date.now() - CHECKOUT_LINK_VALID_HOURS * MS_PER_HOUR);
  const row = await prisma.operationalEvent.findFirst({
    where: {
      customerId,
      category: "billing",
      summary: { contains: "Payment link sent to customer" },
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  return row?.occurredAt ?? null;
}

export async function recordCheckoutLinkSentToCustomer(input: {
  customerId: string;
  actorUserId?: string | null;
  checkoutSessionId: string;
  channels: { email: boolean; whatsapp: boolean };
  paymentUrl: string;
  emailTo?: string | null;
  whatsappTo?: string | null;
  emailError?: string | null;
  whatsappError?: string | null;
  whatsappMessageSid?: string | null;
}): Promise<void> {
  const { recordOperationalEvent } = await import("@/lib/services/operational-event-service");
  await recordOperationalEvent({
    category: "billing",
    customerId: input.customerId,
    actorUserId: input.actorUserId ?? undefined,
    summary: "Payment link sent to customer",
    payload: {
      checkoutSessionId: input.checkoutSessionId,
      channels: input.channels,
      paymentUrl: input.paymentUrl,
      emailTo: input.emailTo ?? null,
      whatsappTo: input.whatsappTo ?? null,
      emailError: input.emailError ?? null,
      whatsappError: input.whatsappError ?? null,
      whatsappMessageSid: input.whatsappMessageSid ?? null,
    },
  });
}
