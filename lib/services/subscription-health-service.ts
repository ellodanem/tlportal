import "server-only";

import type { CustomerSubscriptionStatus, InvoiceStatus } from "@prisma/client";

import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { opsUrgencyFromNextDueDate } from "@/lib/admin/assignment-ops-urgency";
import { getGlobalFleetHealth } from "@/lib/admin/fleet-health";
import {
  effectiveMonthlyFromScheduleCycle,
  effectiveMonthlyRecurringXcd,
} from "@/lib/domain/subscription-mrr";
import { round2 } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";
import { getDefaultMonthlyRateXcd } from "@/lib/stripe/checkout-pricing";
import { isStripeBillingEnabled } from "@/lib/stripe/config";

const MRR_STATUSES: CustomerSubscriptionStatus[] = ["active", "trialing"];
const PAST_DUE_SUB_STATUSES: CustomerSubscriptionStatus[] = ["past_due", "unpaid"];
const OPEN_AR_STATUSES: InvoiceStatus[] = ["open", "partially_paid", "overdue"];
const MS_PER_DAY = 86_400_000;

export type SubscriptionHealthAttentionItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  tone: "urgent" | "warning" | "info";
};

export type SubscriptionHealthPlanMixRow = {
  planTermMonths: number;
  label: string;
  count: number;
};

export type SubscriptionHealthTrendPoint = {
  label: string;
  count: number;
};

function displayName(c: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return person || "Customer";
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function daysUntil(d: Date, now = new Date()): number {
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

function weekStartUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function formatWeekLabel(start: Date): string {
  return start.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function getSubscriptionHealthReport() {
  const now = new Date();
  const defaultMonthlyRate = await getDefaultMonthlyRateXcd();
  const stripeConfigured = isStripeBillingEnabled();
  const trendStart = new Date(now);
  trendStart.setUTCDate(trendStart.getUTCDate() - 90);

  const renewalCutoff = new Date(now);
  renewalCutoff.setUTCDate(renewalCutoff.getUTCDate() + 7);

  const [
    fleetHealth,
    activeSubscriptions,
    pastDueSubscriptions,
    recentSubscriptions,
    assignmentCounts,
    activeSchedules,
    overdueInvoices,
    stripeBillingIssues,
    renewalsDueAssignments,
  ] = await Promise.all([
    getGlobalFleetHealth(),
    prisma.customerSubscription.findMany({
      where: {
        status: { in: MRR_STATUSES },
        customer: activeCustomerWhere,
      },
      select: {
        id: true,
        status: true,
        planTermMonths: true,
        monthlyRateXcd: true,
        vehicleCount: true,
        stripeSubscriptionId: true,
        currentPeriodEnd: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            company: true,
            firstName: true,
            lastName: true,
            stripeMonthlyRateXcd: true,
          },
        },
      },
    }),
    prisma.customerSubscription.findMany({
      where: {
        status: { in: PAST_DUE_SUB_STATUSES },
        customer: activeCustomerWhere,
      },
      select: {
        id: true,
        status: true,
        planTermMonths: true,
        monthlyRateXcd: true,
        vehicleCount: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            company: true,
            firstName: true,
            lastName: true,
            stripeMonthlyRateXcd: true,
          },
        },
      },
    }),
    prisma.customerSubscription.findMany({
      where: {
        createdAt: { gte: trendStart },
        status: { not: "canceled" },
        customer: activeCustomerWhere,
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.serviceAssignment.groupBy({
      by: ["customerId"],
      where: { endDate: null, status: { not: "cancelled" } },
      _count: { _all: true },
    }),
    prisma.recurringInvoiceSchedule.findMany({
      where: {
        status: "active",
        customer: activeCustomerWhere,
      },
      select: {
        id: true,
        intervalMonths: true,
        nextIssueDate: true,
        name: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            company: true,
            firstName: true,
            lastName: true,
          },
        },
        lineItems: { select: { lineTotal: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        status: { in: OPEN_AR_STATUSES },
        amountDue: { gt: 0 },
        dueDate: { lt: now },
      },
      select: {
        id: true,
        number: true,
        amountDue: true,
        dueDate: true,
        customerId: true,
        billToName: true,
        customer: {
          select: { id: true, company: true, firstName: true, lastName: true },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    stripeConfigured
      ? prisma.billingAccount.findMany({
          where: { provider: "stripe", status: { in: ["past_due", "unpaid"] } },
          include: {
            customer: {
              select: { id: true, company: true, firstName: true, lastName: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.serviceAssignment.findMany({
      where: {
        endDate: null,
        status: { not: "cancelled" },
        nextDueDate: { not: null, lte: renewalCutoff },
        customer: activeCustomerWhere,
      },
      include: {
        customer: {
          select: { id: true, company: true, firstName: true, lastName: true },
        },
        device: { select: { imei: true, label: true } },
      },
    }),
  ]);

  const vehiclesByCustomer = new Map(
    assignmentCounts.map((row) => [row.customerId, row._count._all]),
  );

  let stripeMrr = 0;
  let stripeActiveCount = 0;
  const planMixMap = new Map<number, number>();

  for (const sub of activeSubscriptions) {
    const monthlyRate =
      sub.monthlyRateXcd != null
        ? Number(sub.monthlyRateXcd)
        : sub.customer.stripeMonthlyRateXcd != null
          ? Number(sub.customer.stripeMonthlyRateXcd)
          : defaultMonthlyRate;
    const vehicles = sub.vehicleCount ?? vehiclesByCustomer.get(sub.customerId) ?? 1;
    const effective = effectiveMonthlyRecurringXcd(monthlyRate, sub.planTermMonths, vehicles);
    stripeMrr += effective;

    if (sub.stripeSubscriptionId) {
      stripeActiveCount += 1;
    }

    planMixMap.set(sub.planTermMonths, (planMixMap.get(sub.planTermMonths) ?? 0) + 1);
  }

  let manualMrr = 0;
  for (const schedule of activeSchedules) {
    const cycleTotal = schedule.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0);
    manualMrr += effectiveMonthlyFromScheduleCycle(cycleTotal, schedule.intervalMonths);
  }

  const manualActiveCount = activeSchedules.length;
  const totalMrr = round2(stripeMrr + manualMrr);
  const activeSubscriptionCount = stripeActiveCount + manualActiveCount;

  let pastDueMrrAtRisk = 0;
  for (const sub of pastDueSubscriptions) {
    const monthlyRate =
      sub.monthlyRateXcd != null
        ? Number(sub.monthlyRateXcd)
        : sub.customer.stripeMonthlyRateXcd != null
          ? Number(sub.customer.stripeMonthlyRateXcd)
          : defaultMonthlyRate;
    const vehicles = sub.vehicleCount ?? vehiclesByCustomer.get(sub.customerId) ?? 1;
    pastDueMrrAtRisk += effectiveMonthlyRecurringXcd(monthlyRate, sub.planTermMonths, vehicles);
  }

  const overdueInvoiceTotal = round2(
    overdueInvoices.reduce((sum, inv) => sum + Number(inv.amountDue), 0),
  );
  const pastDueCount = pastDueSubscriptions.length + overdueInvoices.length + stripeBillingIssues.length;
  const pastDueAmountAtRisk = round2(pastDueMrrAtRisk + overdueInvoiceTotal);

  let renewalsDueCount = 0;
  for (const sub of activeSubscriptions) {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd <= renewalCutoff) {
      renewalsDueCount += 1;
    }
  }
  for (const schedule of activeSchedules) {
    if (schedule.nextIssueDate <= renewalCutoff) {
      renewalsDueCount += 1;
    }
  }
  for (const assignment of renewalsDueAssignments) {
    const urgency = opsUrgencyFromNextDueDate(assignment.nextDueDate, now);
    if (urgency === "due_soon" || urgency === "overdue") {
      renewalsDueCount += 1;
    }
  }

  const planMix: SubscriptionHealthPlanMixRow[] = [1, 3, 6, 12].map((months) => ({
    planTermMonths: months,
    label: months === 1 ? "1 mo" : `${months} mo`,
    count: planMixMap.get(months) ?? 0,
  }));

  const weekBucketCount = 13;
  const trendBuckets = Array.from({ length: weekBucketCount }, (_, index) => {
    const start = weekStartUtc(trendStart);
    start.setUTCDate(start.getUTCDate() + index * 7);
    return { start, count: 0, label: formatWeekLabel(start) };
  });

  for (const sub of recentSubscriptions) {
    const diffWeeks = Math.floor((sub.createdAt.getTime() - trendStart.getTime()) / (7 * MS_PER_DAY));
    const index = Math.min(weekBucketCount - 1, Math.max(0, diffWeeks));
    const bucket = trendBuckets[index];
    if (bucket) bucket.count += 1;
  }

  const newSubscriptionsTrend: SubscriptionHealthTrendPoint[] = trendBuckets.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
  }));

  const newSubscriptions90d = recentSubscriptions.length;

  const attentionItems: SubscriptionHealthAttentionItem[] = [];

  for (const sub of pastDueSubscriptions) {
    attentionItems.push({
      id: `sub-${sub.id}`,
      title: `${displayName(sub.customer)} — subscription ${sub.status.replace("_", " ")}`,
      meta: "Review card billing and payment status.",
      href: `/admin/customers/${sub.customerId}/billing`,
      tone: "urgent",
    });
  }

  for (const account of stripeBillingIssues) {
    attentionItems.push({
      id: `stripe-${account.id}`,
      title: `${displayName(account.customer)} — Stripe ${account.status}`,
      meta: "Open customer billing to review card subscription.",
      href: `/admin/customers/${account.customerId}/billing`,
      tone: "urgent",
    });
  }

  for (const inv of overdueInvoices.slice(0, 6)) {
    const name = inv.customer ? displayName(inv.customer) : inv.billToName?.trim() || "Customer";
    attentionItems.push({
      id: `inv-${inv.id}`,
      title: `${name} — invoice ${inv.number ?? "overdue"} overdue`,
      meta: inv.dueDate
        ? `Due ${formatShortDate(inv.dueDate)} · ${round2(Number(inv.amountDue))} XCD outstanding`
        : `${round2(Number(inv.amountDue))} XCD outstanding`,
      href: inv.customerId ? `/admin/tl-invoices/${inv.id}` : `/admin/tl-invoices/${inv.id}`,
      tone: "warning",
    });
  }

  const attentionIds = new Set(attentionItems.map((item) => item.id));

  for (const sub of activeSubscriptions) {
    if (!sub.currentPeriodEnd || sub.currentPeriodEnd > renewalCutoff) continue;
    const id = `renew-sub-${sub.id}`;
    if (attentionIds.has(id)) continue;
    const days = daysUntil(sub.currentPeriodEnd, now);
    attentionItems.push({
      id,
      title: `${displayName(sub.customer)} — subscription renews ${days <= 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
      meta: `Period ends ${formatShortDate(sub.currentPeriodEnd)}`,
      href: `/admin/customers/${sub.customerId}/billing`,
      tone: days <= 2 ? "warning" : "info",
    });
    attentionIds.add(id);
  }

  for (const assignment of renewalsDueAssignments) {
    if (attentionItems.length >= 8) break;
    const urgency = opsUrgencyFromNextDueDate(assignment.nextDueDate, now);
    if (urgency !== "due_soon" && urgency !== "overdue") continue;
    const id = `assign-${assignment.id}`;
    if (attentionIds.has(id)) continue;
    const name = displayName(assignment.customer);
    const label = assignment.device.label?.trim() || assignment.device.imei;
    attentionItems.push({
      id,
      title: `${name} — ${urgency === "overdue" ? "overdue renewal" : "renewal due soon"}`,
      meta: `Next due ${assignment.nextDueDate ? formatShortDate(assignment.nextDueDate) : "—"} · ${label}`,
      href: `/admin/customers/${assignment.customer.id}/billing`,
      tone: urgency === "overdue" ? "urgent" : "warning",
    });
    attentionIds.add(id);
  }

  attentionItems.sort((a, b) => {
    const toneRank = (tone: SubscriptionHealthAttentionItem["tone"]) =>
      tone === "urgent" ? 0 : tone === "warning" ? 1 : 2;
    return toneRank(a.tone) - toneRank(b.tone);
  });

  const fleetHealthy = fleetHealth.counts.healthy;
  const fleetTotal = fleetHealth.counts.total;
  const fleetHealthyPct = fleetTotal > 0 ? Math.round((fleetHealthy / fleetTotal) * 100) : 0;

  return {
    stripeConfigured,
    mrrXcd: totalMrr,
    activeSubscriptionCount,
    stripeActiveCount,
    manualActiveCount,
    renewalsDueCount,
    pastDueCount,
    pastDueAmountAtRisk,
    fleetHealthy,
    fleetTotal,
    fleetHealthyPct,
    newSubscriptions90d,
    newSubscriptionsTrend,
    planMix,
    attentionItems: attentionItems.slice(0, 8),
  };
}
