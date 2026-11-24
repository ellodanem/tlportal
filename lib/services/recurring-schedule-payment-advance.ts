import "server-only";

import type { Prisma } from "@prisma/client";

import { nextRecurringScheduleDate, startOfUtcDay } from "@/lib/billing/recurring-period";

type BillingTransaction = Pick<Prisma.TransactionClient, "recurringInvoiceSchedule" | "customerSubscription">;

export type PaidRecurringInvoiceAdvanceInput = {
  kind: string;
  recurringScheduleId: string | null;
  customerSubscriptionId: string | null;
  issueDate: Date;
  recurringPeriodStart: Date | null;
};

/**
 * Move a recurring schedule (and its canonical subscription) to the next period
 * after the cycle invoice is fully paid. Uses the invoiced period as the anchor
 * so an already-advanced date is not pushed a second time.
 */
export async function advanceRecurringScheduleOnPaidInvoice(
  tx: BillingTransaction,
  invoice: PaidRecurringInvoiceAdvanceInput,
): Promise<void> {
  if (invoice.kind !== "recurring" || !invoice.recurringScheduleId) return;

  const schedule = await tx.recurringInvoiceSchedule.findUnique({
    where: { id: invoice.recurringScheduleId },
    select: {
      id: true,
      status: true,
      nextIssueDate: true,
      intervalMonths: true,
      customerSubscriptionId: true,
    },
  });
  if (!schedule || schedule.status === "ended") return;

  const periodStart = startOfUtcDay(invoice.recurringPeriodStart ?? invoice.issueDate);
  const advancedDate = nextRecurringScheduleDate(
    schedule.nextIssueDate,
    periodStart,
    schedule.intervalMonths,
  );
  if (advancedDate.getTime() === schedule.nextIssueDate.getTime()) return;

  await tx.recurringInvoiceSchedule.update({
    where: { id: schedule.id },
    data: { nextIssueDate: advancedDate },
  });

  const subscriptionId = invoice.customerSubscriptionId ?? schedule.customerSubscriptionId;
  if (!subscriptionId) return;
  await tx.customerSubscription.update({
    where: { id: subscriptionId },
    data: { nextBillingDate: advancedDate },
  });
}
