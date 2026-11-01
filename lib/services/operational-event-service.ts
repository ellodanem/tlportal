import "server-only";

import type { Prisma } from "@prisma/client";

import type { OperationalEventCategory } from "@/lib/domain/events";
import { prisma } from "@/lib/db";

export type RecordOperationalEventInput = {
  category: OperationalEventCategory | string;
  summary: string;
  customerId?: string | null;
  deviceId?: string | null;
  actorUserId?: string | null;
  payload?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

export async function recordOperationalEvent(input: RecordOperationalEventInput): Promise<void> {
  await prisma.operationalEvent.create({
    data: {
      category: input.category,
      summary: input.summary,
      customerId: input.customerId ?? undefined,
      deviceId: input.deviceId ?? undefined,
      actorUserId: input.actorUserId ?? undefined,
      payload: input.payload ?? undefined,
      occurredAt: input.occurredAt ?? undefined,
    },
  });
}

export async function listOperationalEventsForCustomer(customerId: string, limit = 10) {
  return prisma.operationalEvent.findMany({
    where: { customerId },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
}

export async function listOperationalEventsForDevice(deviceId: string, limit = 10) {
  return prisma.operationalEvent.findMany({
    where: { deviceId },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
}

/**
 * Events for ONE subscription. Canonical actions record `payload.subscriptionId` (and
 * `payload.targetSubscriptionId` on a service transfer), so no schema change is needed. The
 * query is bounded by the indexed customer id and the `subscription.` category prefix.
 */
export async function listOperationalEventsForSubscription(subscriptionId: string, customerId: string, limit = 50) {
  return prisma.operationalEvent.findMany({
    where: {
      customerId,
      category: { startsWith: "subscription." },
      OR: [
        { payload: { path: ["subscriptionId"], equals: subscriptionId } },
        { payload: { path: ["targetSubscriptionId"], equals: subscriptionId } },
      ],
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
}
