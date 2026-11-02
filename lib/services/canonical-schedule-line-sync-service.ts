import "server-only";

import { Prisma } from "@prisma/client";

import { startOfUtcDay } from "@/lib/billing/recurring-period";
import { prisma } from "@/lib/db";
import {
  CanonicalNativeBillingError,
  resolveCanonicalBillingCycle,
} from "@/lib/domain/canonical-native-billing";

type Db = Prisma.TransactionClient | typeof prisma;

export type CanonicalScheduleLineSyncResult = {
  scheduleId: string;
  changed: boolean;
  lines: { description: string; quantity: string; unitPrice: string; lineTotal: string }[];
};

const syncInclude = {
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { rates: { orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] } },
  },
  recurringSchedules: {
    where: { status: { not: "ended" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { lineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  },
} satisfies Prisma.CustomerSubscriptionInclude;

/**
 * A canonical schedule's invoice lines are always derived from the subscription's services at
 * generation time, so the lines stored on the schedule are only a display/reporting copy. This
 * keeps that copy equal to what the next invoice will contain (one line per billable service).
 *
 * It never touches dates, status, invoices or the customer, and quietly does nothing when the
 * subscription is not canonical, has no single open schedule, or cannot resolve a cycle yet.
 */
export async function syncCanonicalScheduleLines(
  db: Db,
  subscriptionId: string,
): Promise<CanonicalScheduleLineSyncResult | null> {
  const subscription = await db.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: syncInclude,
  });
  if (!subscription || subscription.controlMode !== "canonical" || !subscription.nextBillingDate) return null;
  if (subscription.recurringSchedules.length !== 1) return null;
  const schedule = subscription.recurringSchedules[0];

  let cycle;
  try {
    cycle = resolveCanonicalBillingCycle(
      subscription,
      startOfUtcDay(subscription.nextBillingDate),
      { requireActive: false },
    );
  } catch (caught) {
    if (caught instanceof CanonicalNativeBillingError) return null;
    throw caught;
  }

  const lines = cycle.lines.map((line) => ({
    description: line.description,
    quantity: new Prisma.Decimal(line.quantity).toFixed(4),
    unitPrice: line.agreedAmountPerCycle.toFixed(2),
    lineTotal: line.billedAmount.toFixed(2),
  }));

  const unchanged = schedule.lineItems.length === lines.length && schedule.lineItems.every((stored, index) => {
    const next = lines[index];
    return stored.description === next.description
      && new Prisma.Decimal(stored.quantity).equals(next.quantity)
      && new Prisma.Decimal(stored.unitPrice).equals(next.unitPrice)
      && new Prisma.Decimal(stored.lineTotal).equals(next.lineTotal);
  });
  if (unchanged) return { scheduleId: schedule.id, changed: false, lines };

  await db.recurringScheduleLineItem.deleteMany({ where: { scheduleId: schedule.id } });
  await db.recurringScheduleLineItem.createMany({
    data: lines.map((line, sortOrder) => ({
      scheduleId: schedule.id,
      sortOrder,
      description: line.description,
      quantity: line.quantity,
      unitLabel: "service",
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
  });
  return { scheduleId: schedule.id, changed: true, lines };
}

/** Same sync, addressed by one of the subscription's services. */
export async function syncCanonicalScheduleLinesForItem(db: Db, subscriptionItemId: string): Promise<void> {
  const item = await db.subscriptionItem.findUnique({
    where: { id: subscriptionItemId },
    select: { customerSubscriptionId: true },
  });
  if (item) await syncCanonicalScheduleLines(db, item.customerSubscriptionId);
}
