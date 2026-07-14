import "server-only";

import type { FleetSegmentKey } from "@/lib/admin/fleet-segments";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { opsUrgencyFromNextDueDate, opsUrgencyRank } from "@/lib/admin/assignment-ops-urgency";
import { getGlobalFleetHealth } from "@/lib/admin/fleet-health";
import { isInvoilessLegacyUiEnabled } from "@/lib/domain/native-billing-cutover";

import { prisma } from "@/lib/db";
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

const PAST_DUE_SUB_STATUSES = ["past_due", "unpaid"] as const;
const OPEN_AR_STATUSES = ["open", "partially_paid", "overdue"] as const;

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

const STRIPE_ATTENTION_STATUSES = ["past_due", "unpaid"] as const;

export async function getDashboardStats() {
  const invoilessConfigured = isInvoilessLegacyUiEnabled();
  const stripeConfigured = isStripeBillingEnabled();

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
      where: { endDate: null, status: { not: "cancelled" } },
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
        status: { in: [...PAST_DUE_SUB_STATUSES] },
        customer: activeCustomerWhere,
      },
    }),
    prisma.invoice.count({
      where: {
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
    attentionCount,
    attentionItems,
    upcomingBillItems,
    recentItems,
    fleetHealth,
  };
}
