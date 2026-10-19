import "server-only";

import type { CustomerSubscriptionStatus, InvoiceStatus } from "@prisma/client";

import type { FleetSegmentKey } from "@/lib/admin/fleet-segments";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { activeInvoiceWhere } from "@/lib/admin/active-invoice-filter";
import { opsUrgencyFromNextDueDate, opsUrgencyRank } from "@/lib/admin/assignment-ops-urgency";
import { getGlobalFleetHealth } from "@/lib/admin/fleet-health";
import { resolveCanonicalBillingCycle, CanonicalNativeBillingError } from "@/lib/domain/canonical-native-billing";
import { round2 } from "@/lib/domain/native-billing";
import {
  effectiveMonthlyFromScheduleCycle,
  effectiveMonthlyRecurringXcd,
} from "@/lib/domain/subscription-mrr";
import { isInvoilessLegacyUiEnabled } from "@/lib/domain/native-billing-cutover";

import { prisma } from "@/lib/db";
import { getDefaultMonthlyRateXcd } from "@/lib/stripe/checkout-pricing";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import {
  listRecentPaymentFailureAttentionItems,
  listRecentPaymentFailureCustomerIds,
  paymentFailureEmailFollowUpLabel,
  paymentFailureWhatsAppFollowUpLabel,
} from "@/lib/stripe/payment-failure-recovery";

const unlinkedInvoilessWhere = {
  invoilessCustomerId: null,
  billingAccounts: { none: { provider: "invoiless" as const } },
} as const;

const PAST_DUE_SUB_STATUSES: CustomerSubscriptionStatus[] = ["past_due", "unpaid"];
const ACTIVE_LEGACY_SUB_STATUSES: CustomerSubscriptionStatus[] = ["active", "trialing"];
const OPEN_AR_STATUSES: InvoiceStatus[] = ["open", "partially_paid", "overdue"];
const SIM_NEAR_LIMIT_PERCENT = 80;
const SIM_HIGH_USAGE_PERCENT = 90;
const LOW_INVENTORY_THRESHOLD = 3;
const MONTHS_IN_TREND = 6;

export type DashboardAttentionItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  tone: "urgent" | "warning" | "info";
};

function formatShortDue(d: Date) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type DashboardRecentItem = {
  id: string;
  label: string;
  sub: string;
  at: Date;
  href: string;
};

export type DashboardTrendPoint = {
  label: string;
  count: number;
};

function isXcd(currency: string | null | undefined): boolean {
  return currency?.trim().toUpperCase() === "XCD";
}

function monthStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-029", { month: "short", timeZone: "UTC" });
}

const STRIPE_ATTENTION_STATUSES = ["past_due", "unpaid"] as const;

export async function getDashboardStats() {
  const invoilessConfigured = isInvoilessLegacyUiEnabled();
  const stripeConfigured = isStripeBillingEnabled();
  const dashboardNow = new Date();
  const serviceTrendStart = monthStartUtc(dashboardNow);
  serviceTrendStart.setUTCMonth(serviceTrendStart.getUTCMonth() - (MONTHS_IN_TREND - 1));

  const [
    fleetHealth,
    fleetUnassigned,
    fleetProduction,
    fleetDemo,
    fleetPersonal,
    customerCount,
    assignedDeviceCount,
    inStockDeviceCount,
    suspendedDeviceCount,
    activeServiceCount,
    openAssignmentsWithDue,
    unlinkedInvoilessCount,
    upcomingBillAssignments,
    recentCustomers,
    pendingRegistrationCount,
    simDataSums,
    simCardCount,
    stripeBillingIssues,
    recentPaymentFailures,
    pastDueSubscriptionCount,
    overdueInvoiceCount,
    stripeBillingIssueCount,
    paymentFailureCustomerIds,
    activeLegacySubscriptions,
    activeStandaloneSchedules,
    canonicalSubscriptions,
    outstandingInvoiceGroups,
    overdueInvoices,
    simUsageRows,
    availableSimCount,
    serviceTrendRows,
    defaultMonthlyRate,
    assignmentCountsByCustomer,
  ] = await Promise.all([
    getGlobalFleetHealth(),
    prisma.device.count({
      where: { usagePurpose: "customer", status: "in_stock" },
    }),
    prisma.device.count({
      where: { usagePurpose: "customer", status: { not: "in_stock" } },
    }),
    prisma.device.count({
      where: { usagePurpose: { in: ["internal_demo", "field_test"] } },
    }),
    prisma.device.count({
      where: { usagePurpose: "personal" },
    }),
    prisma.customer.count({ where: activeCustomerWhere }),
    prisma.device.count({ where: { status: "assigned", usagePurpose: "customer" } }),
    prisma.device.count({ where: { status: "in_stock", usagePurpose: "customer" } }),
    prisma.device.count({ where: { status: "suspended", usagePurpose: "customer" } }),
    prisma.serviceAssignment.count({
      where: {
        endDate: null,
        status: { in: ["active", "due_soon", "overdue"] },
        customer: activeCustomerWhere,
      },
    }),
    prisma.serviceAssignment.findMany({
      where: {
        endDate: null,
        status: { not: "cancelled" },
        nextDueDate: { not: null },
      },
      include: {
        customer: {
          select: { id: true, company: true, firstName: true, lastName: true },
        },
        device: { select: { imei: true } },
      },
    }),
    invoilessConfigured
      ? prisma.customer.count({ where: { ...unlinkedInvoilessWhere, ...activeCustomerWhere } })
      : Promise.resolve(0),
    prisma.serviceAssignment.findMany({
      where: {
        endDate: null,
        status: "active",
        nextDueDate: { not: null },
      },
      take: 8,
      orderBy: { nextDueDate: "asc" },
      include: {
        customer: {
          select: { id: true, company: true, firstName: true, lastName: true },
        },
        device: { select: { imei: true } },
      },
    }),
    prisma.customer.findMany({
      where: activeCustomerWhere,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        company: true,
        firstName: true,
        lastName: true,
        updatedAt: true,
      },
    }),
    prisma.registrationRequest.count({ where: { status: "pending" } }),
    prisma.simCard.aggregate({
      _sum: { usedDataMB: true, totalDataMB: true },
    }),
    prisma.simCard.count(),
    stripeConfigured
      ? prisma.billingAccount.findMany({
          where: {
            provider: "stripe",
            status: { in: [...STRIPE_ATTENTION_STATUSES] },
          },
          take: 6,
          orderBy: { updatedAt: "desc" },
          include: {
            customer: {
              select: { id: true, company: true, firstName: true, lastName: true },
            },
          },
        })
      : Promise.resolve([]),
    stripeConfigured ? listRecentPaymentFailureAttentionItems(6) : Promise.resolve([]),
    prisma.customerSubscription.count({
      where: {
        controlMode: "legacy",
        status: { in: [...PAST_DUE_SUB_STATUSES] },
        customer: activeCustomerWhere,
      },
    }),
    prisma.invoice.count({
      where: {
        ...activeInvoiceWhere,
        status: { in: [...OPEN_AR_STATUSES] },
        amountDue: { gt: 0 },
        dueDate: { lt: new Date() },
      },
    }),
    stripeConfigured
      ? prisma.billingAccount.count({
          where: {
            provider: "stripe",
            status: { in: [...STRIPE_ATTENTION_STATUSES] },
          },
        })
      : Promise.resolve(0),
    stripeConfigured ? listRecentPaymentFailureCustomerIds(7) : Promise.resolve(new Set<string>()),
    prisma.customerSubscription.findMany({
      where: {
        controlMode: "legacy",
        status: { in: ACTIVE_LEGACY_SUB_STATUSES },
        customer: activeCustomerWhere,
      },
      select: {
        id: true,
        customerId: true,
        planTermMonths: true,
        monthlyRateXcd: true,
        vehicleCount: true,
        customer: { select: { stripeMonthlyRateXcd: true } },
      },
    }),
    prisma.recurringInvoiceSchedule.findMany({
      where: {
        status: "active",
        customer: activeCustomerWhere,
        OR: [
          { customerSubscriptionId: null },
          {
            customerSubscription: {
              controlMode: "legacy",
              status: { notIn: ACTIVE_LEGACY_SUB_STATUSES },
            },
          },
        ],
      },
      select: {
        id: true,
        currency: true,
        intervalMonths: true,
        lineItems: { select: { lineTotal: true } },
      },
    }),
    prisma.customerSubscription.findMany({
      where: {
        controlMode: "canonical",
        lifecycleStatus: "active",
        customer: activeCustomerWhere,
      },
      select: {
        id: true,
        lifecycleStatus: true,
        billingIntervalMonths: true,
        currency: true,
        items: {
          select: {
            id: true,
            label: true,
            status: true,
            billingEffectiveFrom: true,
            billingEffectiveUntil: true,
            rates: {
              select: {
                id: true,
                billingIntervalMonths: true,
                agreedAmountPerCycle: true,
                currency: true,
                effectiveFrom: true,
                effectiveUntil: true,
                classification: true,
              },
            },
          },
        },
      },
    }),
    prisma.invoice.groupBy({
      by: ["currency"],
      where: {
        ...activeInvoiceWhere,
        status: { in: OPEN_AR_STATUSES },
        amountDue: { gt: 0 },
      },
      _sum: { amountDue: true },
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: {
        ...activeInvoiceWhere,
        status: { in: OPEN_AR_STATUSES },
        amountDue: { gt: 0 },
        dueDate: { lt: dashboardNow },
      },
      select: { id: true, number: true, amountDue: true, dueDate: true, customerId: true },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.simCard.findMany({
      where: { totalDataMB: { gt: 0 }, usedDataMB: { not: null } },
      select: { usedDataMB: true, totalDataMB: true },
    }),
    prisma.simCard.count({ where: { device: { is: null } } }),
    prisma.serviceAssignment.findMany({
      where: { customer: activeCustomerWhere, createdAt: { gte: serviceTrendStart } },
      select: { createdAt: true },
    }),
    getDefaultMonthlyRateXcd(),
    prisma.serviceAssignment.groupBy({
      by: ["customerId"],
      where: { endDate: null, status: { not: "cancelled" }, customer: activeCustomerWhere },
      _count: { _all: true },
    }),
  ]);

  type DueAssignment = (typeof openAssignmentsWithDue)[number];
  const attentionCandidates: { assignment: DueAssignment; urgency: ReturnType<typeof opsUrgencyFromNextDueDate> }[] =
    [];
  let overdueAssignmentCount = 0;
  let dueSoonAssignmentCount = 0;

  for (const a of openAssignmentsWithDue) {
    const urgency = opsUrgencyFromNextDueDate(a.nextDueDate);
    if (urgency === "overdue") {
      overdueAssignmentCount += 1;
      attentionCandidates.push({ assignment: a, urgency });
    } else if (urgency === "due_soon") {
      dueSoonAssignmentCount += 1;
      attentionCandidates.push({ assignment: a, urgency });
    }
  }

  attentionCandidates.sort((x, y) => {
    const r = opsUrgencyRank(x.urgency) - opsUrgencyRank(y.urgency);
    if (r !== 0) return r;
    const dx = (x.assignment.nextDueDate?.getTime() ?? 0) - (y.assignment.nextDueDate?.getTime() ?? 0);
    return dx;
  });

  const failedPaymentCount = paymentFailureCustomerIds.size;
  const pastDueCount =
    pastDueSubscriptionCount + overdueInvoiceCount + stripeBillingIssueCount;
  const paymentIssueCount = pastDueCount + failedPaymentCount;

  const attentionCount =
    overdueAssignmentCount +
    dueSoonAssignmentCount +
    (invoilessConfigured ? unlinkedInvoilessCount : 0) +
    stripeBillingIssueCount +
    failedPaymentCount;

  const displayName = (c: {
    company: string | null;
    firstName: string | null;
    lastName: string | null;
  }) => {
    const co = c.company?.trim();
    if (co) return co;
    const p = [c.firstName, c.lastName].filter(Boolean).join(" ");
    return p || "Customer";
  };

  type RankedAttention = {
    rank: number;
    sortKey: number;
    customerId: string;
    item: DashboardAttentionItem;
  };

  const ATTENTION_LIMIT = 6;
  const rankedAttention: RankedAttention[] = [];

  for (const failure of recentPaymentFailures) {
    const name = displayName(failure.customer);
    const amountLabel = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: failure.currency,
    }).format(failure.amount);
    const declinePart = failure.declineCode ? ` · ${failure.declineCode}` : "";
    const emailLabel = paymentFailureEmailFollowUpLabel({
      emailSent: failure.emailSent,
      emailError: failure.emailError,
    });
    const whatsAppLabel = paymentFailureWhatsAppFollowUpLabel({
      whatsAppSent: failure.whatsAppSent,
      whatsAppError: failure.whatsAppError,
    });
    const smsPart =
      failure.smsRecipientCount > 0
        ? ` · ${failure.smsRecipientCount} staff SMS`
        : "";
    rankedAttention.push({
      rank: 0,
      sortKey: -failure.occurredAt.getTime(),
      customerId: failure.customerId,
      item: {
        id: `pay-fail-${failure.customerId}`,
        title: `Payment declined — ${name}`,
        meta: `${amountLabel}${declinePart} · ${emailLabel} · ${whatsAppLabel}${smsPart} — follow up on billing.`,
        href: `/admin/customers/${failure.customerId}/billing`,
        tone: "urgent",
      },
    });
  }

  for (const { assignment: a, urgency } of attentionCandidates) {
    if (urgency !== "overdue") continue;
    const name = displayName(a.customer);
    const duePart = a.nextDueDate
      ? `Next due ${formatShortDue(a.nextDueDate)}`
      : "Next due not set";
    rankedAttention.push({
      rank: 1,
      sortKey: a.nextDueDate?.getTime() ?? 0,
      customerId: a.customer.id,
      item: {
        id: a.id,
        title: `Overdue service — ${name}`,
        meta: `${duePart} · IMEI ${a.device.imei}`,
        href: `/admin/customers/${a.customer.id}/billing`,
        tone: "urgent",
      },
    });
  }

  for (const account of stripeBillingIssues) {
    const name = displayName(account.customer);
    rankedAttention.push({
      rank: 2,
      sortKey: 0,
      customerId: account.customer.id,
      item: {
        id: `stripe-${account.id}`,
        title: `Stripe ${account.status} — ${name}`,
        meta: "Open customer billing to review card subscription.",
        href: `/admin/customers/${account.customer.id}/billing`,
        tone: "urgent",
      },
    });
  }

  for (const { assignment: a, urgency } of attentionCandidates) {
    if (urgency !== "due_soon") continue;
    const name = displayName(a.customer);
    const duePart = a.nextDueDate
      ? `Next due ${formatShortDue(a.nextDueDate)}`
      : "Next due not set";
    rankedAttention.push({
      rank: 3,
      sortKey: a.nextDueDate?.getTime() ?? 0,
      customerId: a.customer.id,
      item: {
        id: a.id,
        title: `Due soon — ${name}`,
        meta: `${duePart} · IMEI ${a.device.imei}`,
        href: `/admin/customers/${a.customer.id}/billing`,
        tone: "warning",
      },
    });
  }

  if (invoilessConfigured && unlinkedInvoilessCount > 0) {
    const unlinked = await prisma.customer.findMany({
      where: { ...unlinkedInvoilessWhere, ...activeCustomerWhere },
      take: 12,
      orderBy: { updatedAt: "desc" },
      select: { id: true, company: true, firstName: true, lastName: true },
    });
    for (const c of unlinked) {
      rankedAttention.push({
        rank: 4,
        sortKey: 0,
        customerId: c.id,
        item: {
          id: `inv-${c.id}`,
          title: `Invoiless not linked — ${displayName(c)}`,
          meta: "Link billing accounts on the customer Billing tab.",
          href: `/admin/customers/${c.id}/billing`,
          tone: "info",
        },
      });
    }
  }

  rankedAttention.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.sortKey - b.sortKey;
  });

  const attentionByCustomer = new Set<string>();
  const attentionItems: DashboardAttentionItem[] = [];
  for (const candidate of rankedAttention) {
    if (attentionByCustomer.has(candidate.customerId)) continue;
    attentionByCustomer.add(candidate.customerId);
    attentionItems.push(candidate.item);
    if (attentionItems.length >= ATTENTION_LIMIT) break;
  }

  const attentionAssignmentIds = new Set(
    attentionCandidates.map((c) => c.assignment.id),
  );
  const upcomingBillItems: DashboardAttentionItem[] = [];
  for (const a of upcomingBillAssignments) {
    if (attentionAssignmentIds.has(a.id)) continue;
    if (!a.nextDueDate) continue;
    const name = displayName(a.customer);
    upcomingBillItems.push({
      id: `up-${a.id}`,
      title: `Next bill — ${name}`,
      meta: `Due ${formatShortDue(a.nextDueDate)} · IMEI ${a.device.imei}`,
      href: `/admin/customers/${a.customer.id}/billing`,
      tone: "info",
    });
    if (upcomingBillItems.length >= 6) break;
  }

  const simUsedSumMb = simDataSums._sum.usedDataMB ?? 0;
  const simTotalSumMb = simDataSums._sum.totalDataMB ?? 0;

  let simsNearDataLimitCount = 0;
  let simsHighUsageCount = 0;
  let simsOverDataLimitCount = 0;
  for (const sim of simUsageRows) {
    const total = sim.totalDataMB ?? 0;
    const used = sim.usedDataMB ?? 0;
    if (total <= 0 || used < 0) continue;
    const usagePercent = (used / total) * 100;
    if (usagePercent >= SIM_NEAR_LIMIT_PERCENT) simsNearDataLimitCount += 1;
    if (usagePercent >= SIM_HIGH_USAGE_PERCENT) simsHighUsageCount += 1;
    if (usagePercent >= 100) simsOverDataLimitCount += 1;
  }

  const devicesInventoryLow = inStockDeviceCount < LOW_INVENTORY_THRESHOLD;
  const simsInventoryLow = availableSimCount < LOW_INVENTORY_THRESHOLD;

  const activeAssignmentsByCustomer = new Map(
    assignmentCountsByCustomer.map((row) => [row.customerId, row._count._all]),
  );

  let legacyMrrXcd = 0;
  for (const subscription of activeLegacySubscriptions) {
    const monthlyRate = subscription.monthlyRateXcd != null
      ? Number(subscription.monthlyRateXcd)
      : subscription.customer.stripeMonthlyRateXcd != null
        ? Number(subscription.customer.stripeMonthlyRateXcd)
        : defaultMonthlyRate;
    const vehicles = subscription.vehicleCount ?? activeAssignmentsByCustomer.get(subscription.customerId) ?? 1;
    legacyMrrXcd += effectiveMonthlyRecurringXcd(
      monthlyRate,
      subscription.planTermMonths,
      vehicles,
    );
  }

  let manualMrrXcd = 0;
  let nonXcdRecurringSourceCount = 0;
  for (const schedule of activeStandaloneSchedules) {
    if (!isXcd(schedule.currency)) {
      nonXcdRecurringSourceCount += 1;
      continue;
    }
    const cycleTotal = schedule.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0);
    manualMrrXcd += effectiveMonthlyFromScheduleCycle(cycleTotal, schedule.intervalMonths);
  }

  let canonicalMrrXcd = 0;
  let canonicalMrrUnavailableCount = 0;
  for (const subscription of canonicalSubscriptions) {
    if (!isXcd(subscription.currency)) {
      nonXcdRecurringSourceCount += 1;
      continue;
    }
    try {
      const cycle = resolveCanonicalBillingCycle(subscription, dashboardNow);
      canonicalMrrXcd += Number(cycle.subtotal) / cycle.billingIntervalMonths;
    } catch (caught) {
      if (!(caught instanceof CanonicalNativeBillingError)) throw caught;
      canonicalMrrUnavailableCount += 1;
    }
  }
  const monthlyRecurringRevenueXcd = round2(legacyMrrXcd + manualMrrXcd + canonicalMrrXcd);

  let outstandingBalanceXcd = 0;
  let outstandingInvoiceCount = 0;
  let nonXcdOutstandingInvoiceCount = 0;
  for (const group of outstandingInvoiceGroups) {
    if (isXcd(group.currency)) {
      outstandingBalanceXcd += Number(group._sum.amountDue ?? 0);
      outstandingInvoiceCount += group._count._all;
    } else {
      nonXcdOutstandingInvoiceCount += group._count._all;
    }
  }
  outstandingBalanceXcd = round2(outstandingBalanceXcd);

  const serviceTrend = Array.from({ length: MONTHS_IN_TREND }, (_, index) => {
    const month = new Date(serviceTrendStart);
    month.setUTCMonth(month.getUTCMonth() + index);
    return { month, count: 0, label: formatMonthLabel(month) };
  });
  for (const row of serviceTrendRows) {
    const monthIndex = (row.createdAt.getUTCFullYear() - serviceTrendStart.getUTCFullYear()) * 12
      + row.createdAt.getUTCMonth() - serviceTrendStart.getUTCMonth();
    if (monthIndex >= 0 && monthIndex < serviceTrend.length) {
      serviceTrend[monthIndex]!.count += 1;
    }
  }

  const recentItems: DashboardRecentItem[] = recentCustomers.map((c) => ({
    id: c.id,
    label: `Customer updated — ${displayName(c)}`,
    sub: "Profile or billing fields changed",
    at: c.updatedAt,
    href: `/admin/customers/${c.id}`,
  }));

  const fleetSegments: Record<FleetSegmentKey, number> = {
    unassigned: fleetUnassigned,
    production: fleetProduction,
    demo: fleetDemo,
    personal: fleetPersonal,
  };

  return {
    invoilessConfigured,
    stripeConfigured,
    stripeBillingIssueCount,
    pastDueCount,
    failedPaymentCount,
    paymentIssueCount,
    fleetSegments,
    customerCount,
    assignedDeviceCount,
    inStockDeviceCount,
    suspendedDeviceCount,
    activeServiceCount,
    overdueAssignmentCount,
    dueSoonAssignmentCount,
    unlinkedInvoilessCount,
    pendingRegistrationCount,
    simUsedSumMb,
    simTotalSumMb,
    simCardCount,
    simsNearDataLimitCount,
    simsHighUsageCount,
    simsOverDataLimitCount,
    availableSimCount,
    devicesInventoryLow,
    simsInventoryLow,
    lowInventoryThreshold: LOW_INVENTORY_THRESHOLD,
    monthlyRecurringRevenueXcd,
    canonicalMrrUnavailableCount,
    nonXcdRecurringSourceCount,
    outstandingBalanceXcd,
    outstandingInvoiceCount,
    overdueInvoiceCount: overdueInvoices.length,
    nonXcdOutstandingInvoiceCount,
    serviceTrend: serviceTrend.map(({ label, count }) => ({ label, count })),
    attentionCount,
    attentionItems,
    upcomingBillItems,
    recentItems,
    fleetHealth,
  };
}
