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
