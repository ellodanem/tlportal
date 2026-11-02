import "server-only";

import { Prisma } from "@prisma/client";

import { startOfUtcDay } from "@/lib/billing/recurring-period";
import { prisma } from "@/lib/db";
import {
  CanonicalNativeBillingError,
  resolveCanonicalBillingCycle,
} from "@/lib/domain/canonical-native-billing";
import {
  DERIVED_LINE_UNIT_LABEL,
  GROUPED_LINE_UNIT_LABEL,
  SchedulePresentationError,
  groupedLinesStillValid,
  validatePresentationLines,
  type PresentationLineInput,
} from "@/lib/domain/canonical-schedule-presentation";

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
  options: { ungroup?: boolean } = {},
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

  // Lines staff regrouped (e.g. one "x 5" line) are kept for as long as they still add up to the
  // cycle total; once services or rates change the total, they fall back to one line per service.
  if (!options.ungroup && groupedLinesStillValid(schedule.lineItems, cycle.subtotal)) {
    return {
      scheduleId: schedule.id,
      changed: false,
      lines: schedule.lineItems.map((line) => ({
        description: line.description,
        quantity: line.quantity.toFixed(4),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
    };
  }

  const lines = cycle.lines.map((line) => ({
    description: line.description,
    quantity: new Prisma.Decimal(line.quantity).toFixed(4),
    unitPrice: line.agreedAmountPerCycle.toFixed(2),
    lineTotal: line.billedAmount.toFixed(2),
  }));

  const unchanged = schedule.lineItems.length === lines.length && schedule.lineItems.every((stored, index) => {
    const next = lines[index];
    return stored.unitLabel === DERIVED_LINE_UNIT_LABEL
      && stored.description === next.description
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
      unitLabel: DERIVED_LINE_UNIT_LABEL,
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

export type SaveCanonicalSchedulePresentationInput = {
  name: string | null;
  notes: string | null;
  paymentInstructions: string | null;
  dueDaysAfterIssue: number;
  autoEmail: boolean;
  emailTo: string | null;
  lines: PresentationLineInput[];
};

/**
 * Staff edit of a subscription-owned schedule: wording, terms, email settings and how the cycle
 * total is split into invoice lines. Customer, cadence, currency, next issue date and the total
 * stay owned by the subscription, so they are never read from this input.
 */
export async function saveCanonicalSchedulePresentation(
  scheduleId: string,
  input: SaveCanonicalSchedulePresentationInput,
): Promise<void> {
  if (!Number.isInteger(input.dueDaysAfterIssue) || input.dueDaysAfterIssue < 0 || input.dueDaysAfterIssue > 365) {
    throw new SchedulePresentationError("DUE_DAYS", "Due days must be a whole number between 0 and 365.");
  }
  await prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringInvoiceSchedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, status: true, customerSubscriptionId: true },
    });
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status === "ended") throw new Error("Ended schedules cannot be edited.");
    if (!schedule.customerSubscriptionId) throw new Error("This schedule is not managed by a subscription.");

    const subscription = await tx.customerSubscription.findUniqueOrThrow({
      where: { id: schedule.customerSubscriptionId },
      include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { rates: true } } },
    });
    if (!subscription.nextBillingDate) throw new Error("The subscription has no next billing date.");
    const cycle = resolveCanonicalBillingCycle(
      subscription,
      startOfUtcDay(subscription.nextBillingDate),
      { requireActive: false },
    );
    const lines = validatePresentationLines(input.lines, cycle.subtotal);

    await tx.recurringScheduleLineItem.deleteMany({ where: { scheduleId } });
    await tx.recurringInvoiceSchedule.update({
      where: { id: scheduleId },
      data: {
        name: input.name,
        notes: input.notes,
        paymentInstructions: input.paymentInstructions,
        dueDaysAfterIssue: input.dueDaysAfterIssue,
        autoEmail: input.autoEmail,
        emailTo: input.emailTo,
        lineItems: {
          create: lines.map((line, sortOrder) => ({
            sortOrder,
            description: line.description,
            quantity: line.quantity.toFixed(4),
            unitLabel: GROUPED_LINE_UNIT_LABEL,
            unitPrice: line.unitPrice.toFixed(2),
            lineTotal: line.lineTotal.toFixed(2),
          })),
        },
      },
    });
  });
}

/** Drops any regrouping so the schedule lists one line per service again. */
export async function resetCanonicalScheduleLines(scheduleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringInvoiceSchedule.findUnique({
      where: { id: scheduleId },
      select: { customerSubscriptionId: true },
    });
    if (!schedule?.customerSubscriptionId) throw new Error("This schedule is not managed by a subscription.");
    await syncCanonicalScheduleLines(tx, schedule.customerSubscriptionId, { ungroup: true });
  });
}
