import "server-only";

import type { ServiceAssignment } from "@prisma/client";

import { addCalendarMonths, formatAssignmentDateLabel } from "@/lib/domain/assignment-renewal";
import {
  billableAssignmentWhere,
  openAssignmentWhere,
  stripeTrackAssignmentWhere,
} from "@/lib/domain/service-assignment-queries";
import { prisma } from "@/lib/db";
import { formatPlanTerm } from "@/lib/subscription-options/display";

import { recordOperationalEvent } from "./operational-event-service";

export type MarkAssignmentPaidSource = "manual" | "stripe";

export type MarkAssignmentPeriodPaidInput = {
  assignmentId: string;
  source: MarkAssignmentPaidSource;
  /** Stripe `in_…` or Invoiless invoice id — stored on assignment for idempotency / audit. */
  invoiceRef?: string | null;
  /** Manual only: set next due explicitly instead of advancing by billing term. */
  nextDueOverride?: Date | null;
  actorUserId?: string | null;
};

export type MarkAssignmentPeriodPaidResult =
  | {
      ok: true;
      assignmentId: string;
      customerId: string;
      deviceId: string;
      previousNextDue: Date | null;
      newNextDue: Date;
      alreadyRecorded: boolean;
      usedOverride: boolean;
    }
  | { ok: false; error: string };

function billableAssignmentWhereById(assignmentId: string) {
  return {
    id: assignmentId,
    ...billableAssignmentWhere,
  };
}

function resolveAdvanceBaseDate(assignment: Pick<ServiceAssignment, "nextDueDate" | "startDate">): Date {
  if (assignment.nextDueDate) {
    return assignment.nextDueDate;
  }
  if (assignment.startDate) {
    return assignment.startDate;
  }
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  return today;
}

export function computeNextDueAfterPayment(
  assignment: Pick<ServiceAssignment, "nextDueDate" | "startDate" | "intervalMonths">,
): { baseDate: Date; newNextDue: Date } | { error: string } {
  const months = assignment.intervalMonths;
  if (months == null || !Number.isFinite(months) || months <= 0) {
    return { error: "Set a billing term (1, 3, 6, or 12 months) on this assignment before marking paid." };
  }
  const baseDate = resolveAdvanceBaseDate(assignment);
  return { baseDate, newNextDue: addCalendarMonths(baseDate, months) };
}

export function resolveNextDueAfterPayment(
  assignment: Pick<ServiceAssignment, "nextDueDate" | "startDate" | "intervalMonths">,
  nextDueOverride?: Date | null,
): { baseDate: Date; newNextDue: Date; usedOverride: boolean } | { error: string } {
  if (nextDueOverride) {
    const baseDate = resolveAdvanceBaseDate(assignment);
    return { baseDate, newNextDue: nextDueOverride, usedOverride: true };
  }
  const next = computeNextDueAfterPayment(assignment);
  if ("error" in next) {
    return next;
  }
  return { ...next, usedOverride: false };
}

export async function markAssignmentPeriodPaid(
  input: MarkAssignmentPeriodPaidInput,
): Promise<MarkAssignmentPeriodPaidResult> {
  const assignment = await prisma.serviceAssignment.findFirst({
    where: billableAssignmentWhereById(input.assignmentId),
    include: {
      device: { select: { id: true, imei: true, label: true } },
      customer: { select: { id: true, billingMode: true } },
    },
  });

  if (!assignment) {
    return { ok: false, error: "Active assignment not found." };
  }

  const invoiceRef = input.invoiceRef?.trim() || null;
  if (
    invoiceRef &&
    input.source === "stripe" &&
    assignment.lastInvoiceId === invoiceRef
  ) {
    const next = computeNextDueAfterPayment(assignment);
    if ("error" in next) {
      return { ok: false, error: next.error };
    }
    return {
      ok: true,
      assignmentId: assignment.id,
      customerId: assignment.customerId,
      deviceId: assignment.deviceId,
      previousNextDue: assignment.nextDueDate,
      newNextDue: next.newNextDue,
      alreadyRecorded: true,
      usedOverride: false,
    };
  }

  const next = resolveNextDueAfterPayment(assignment, input.nextDueOverride);
  if ("error" in next) {
    return { ok: false, error: next.error };
  }

  const paymentLabel = input.source === "stripe" ? "paid (Stripe)" : "paid (manual)";

  await prisma.serviceAssignment.update({
    where: { id: assignment.id },
    data: {
      nextDueDate: next.newNextDue,
      status: "active",
      lastPaymentStatus: paymentLabel,
      lastInvoiceId: invoiceRef ?? assignment.lastInvoiceId,
      startDate: assignment.startDate ?? (assignment.nextDueDate ? null : next.baseDate),
    },
  });

  const deviceLabel =
    assignment.device.label?.trim() || assignment.device.imei || assignment.device.id.slice(0, 8);

  await recordOperationalEvent({
    category: "renewal.paid",
    summary: `Renewal marked paid — ${deviceLabel}`,
    customerId: assignment.customerId,
    actorUserId: input.actorUserId ?? undefined,
    payload: {
      assignmentId: assignment.id,
      deviceId: assignment.deviceId,
      source: input.source,
      invoiceRef,
      intervalMonths: assignment.intervalMonths,
      previousNextDue: assignment.nextDueDate?.toISOString() ?? null,
      newNextDue: next.newNextDue.toISOString(),
      nextDueOverride: next.usedOverride,
      previousLabel: formatAssignmentDateLabel(assignment.nextDueDate),
      newLabel: formatAssignmentDateLabel(next.newNextDue),
      termLabel: assignment.intervalMonths != null ? formatPlanTerm(assignment.intervalMonths) : null,
    },
  });

  return {
    ok: true,
    assignmentId: assignment.id,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    previousNextDue: assignment.nextDueDate,
    newNextDue: next.newNextDue,
    alreadyRecorded: false,
    usedOverride: next.usedOverride,
  };
}

export function isStripeRenewalAutoAdvanceEnabled(): boolean {
  const flag = process.env.STRIPE_RENEWAL_AUTO_ADVANCE?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") {
    return false;
  }
  return true;
}

/**
 * Resolve the Stripe plan term for auto-advance from the linked CustomerSubscription.
 */
async function resolveStripePlanTermMonths(customerId: string): Promise<number | null> {
  const withStripeId = await prisma.customerSubscription.findFirst({
    where: {
      customerId,
      stripeSubscriptionId: { not: null },
      status: { in: ["active", "trialing", "past_due", "unpaid", "pending_payment"] },
    },
    orderBy: { updatedAt: "desc" },
    select: { planTermMonths: true },
  });
  if (withStripeId?.planTermMonths != null && withStripeId.planTermMonths > 0) {
    return withStripeId.planTermMonths;
  }

  const anySub = await prisma.customerSubscription.findFirst({
    where: { customerId },
    orderBy: { updatedAt: "desc" },
    select: { planTermMonths: true },
  });
  if (anySub?.planTermMonths != null && anySub.planTermMonths > 0) {
    return anySub.planTermMonths;
  }
  return null;
}

/**
 * After Stripe `invoice.paid`, advance next due on Stripe-track assignments only
 * (intervalMonths matches the Stripe plan term). Other-term devices stay on Device renewals.
 * If every live device has no term set, inherit the Stripe plan term then advance.
 * Idempotent per assignment via lastInvoiceId.
 */
export async function advanceAssignmentsOnStripeInvoicePaid(
  customerId: string,
  stripeInvoiceId: string,
): Promise<{ advanced: number; skipped: number; reason?: string }> {
  if (!isStripeRenewalAutoAdvanceEnabled()) {
    return { advanced: 0, skipped: 0, reason: "auto_advance_disabled" };
  }

  const planTermMonths = await resolveStripePlanTermMonths(customerId);
  if (planTermMonths == null) {
    return { advanced: 0, skipped: 0, reason: "missing_plan_term" };
  }

  let assignments = await prisma.serviceAssignment.findMany({
    where: {
      customerId,
      ...stripeTrackAssignmentWhere(planTermMonths),
    },
    select: { id: true },
  });

  if (assignments.length === 0) {
    const billable = await prisma.serviceAssignment.findMany({
      where: { customerId, ...billableAssignmentWhere },
      select: { id: true, intervalMonths: true },
    });
    const unset = billable.filter((a) => a.intervalMonths == null);
    const otherTerm = billable.filter(
      (a) => a.intervalMonths != null && a.intervalMonths !== planTermMonths,
    );
    if (unset.length > 0 && otherTerm.length === 0) {
      await prisma.serviceAssignment.updateMany({
        where: { customerId, ...billableAssignmentWhere, intervalMonths: null },
        data: { intervalMonths: planTermMonths },
      });
      assignments = unset.map((a) => ({ id: a.id }));
    } else if (billable.length > 0) {
      return {
        advanced: 0,
        skipped: billable.length,
        reason: "no_stripe_track_assignments",
      };
    }
  }

  if (assignments.length === 0) {
    return { advanced: 0, skipped: 0, reason: "no_assignments" };
  }

  let advanced = 0;
  let skipped = 0;

  for (const a of assignments) {
    const result = await markAssignmentPeriodPaid({
      assignmentId: a.id,
      source: "stripe",
      invoiceRef: stripeInvoiceId,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    if (result.alreadyRecorded) {
      skipped += 1;
    } else {
      advanced += 1;
    }
  }

  return { advanced, skipped };
}

export type UpdateAssignmentNextDueInput = {
  assignmentId: string;
  nextDueDate: Date | null;
};

export type UpdateAssignmentNextDueResult =
  | {
      ok: true;
      customerId: string;
      deviceId: string;
      previousNextDue: Date | null;
      newNextDue: Date | null;
    }
  | { ok: false; error: string };

export async function updateAssignmentNextDue(
  input: UpdateAssignmentNextDueInput,
): Promise<UpdateAssignmentNextDueResult> {
  const assignment = await prisma.serviceAssignment.findFirst({
    where: billableAssignmentWhereById(input.assignmentId),
    select: { id: true, customerId: true, deviceId: true, nextDueDate: true },
  });

  if (!assignment) {
    return { ok: false, error: "Active assignment not found." };
  }

  await prisma.serviceAssignment.update({
    where: { id: assignment.id },
    data: { nextDueDate: input.nextDueDate },
  });

  return {
    ok: true,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    previousNextDue: assignment.nextDueDate,
    newNextDue: input.nextDueDate,
  };
}

export type UpdateAssignmentIntervalMonthsInput = {
  assignmentId: string;
  intervalMonths: number | null;
};

export type UpdateAssignmentIntervalMonthsResult =
  | {
      ok: true;
      customerId: string;
      deviceId: string;
      previousIntervalMonths: number | null;
      newIntervalMonths: number | null;
    }
  | { ok: false; error: string };

export async function updateAssignmentIntervalMonths(
  input: UpdateAssignmentIntervalMonthsInput,
): Promise<UpdateAssignmentIntervalMonthsResult> {
  const assignment = await prisma.serviceAssignment.findFirst({
    where: billableAssignmentWhereById(input.assignmentId),
    select: { id: true, customerId: true, deviceId: true, intervalMonths: true },
  });

  if (!assignment) {
    return { ok: false, error: "Active assignment not found." };
  }

  await prisma.serviceAssignment.update({
    where: { id: assignment.id },
    data: { intervalMonths: input.intervalMonths },
  });

  return {
    ok: true,
    customerId: assignment.customerId,
    deviceId: assignment.deviceId,
    previousIntervalMonths: assignment.intervalMonths,
    newIntervalMonths: input.intervalMonths,
  };
}

export async function listActiveAssignmentsForRenewal(customerId: string) {
  return prisma.serviceAssignment.findMany({
    where: {
      customerId,
      ...openAssignmentWhere,
    },
    orderBy: [{ nextDueDate: "asc" }, { createdAt: "asc" }],
    include: {
      device: {
        select: {
          id: true,
          imei: true,
          label: true,
          objectType: true,
        },
      },
    },
  });
}

/** Billable assignments only — bulk mark paid, Stripe advance, vehicle count. */
export async function listBillableAssignmentsForRenewal(customerId: string) {
  return prisma.serviceAssignment.findMany({
    where: {
      customerId,
      ...billableAssignmentWhere,
    },
    orderBy: [{ nextDueDate: "asc" }, { createdAt: "asc" }],
    include: {
      device: {
        select: {
          id: true,
          imei: true,
          label: true,
          objectType: true,
        },
      },
    },
  });
}
