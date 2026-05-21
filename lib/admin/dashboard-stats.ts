import "server-only";

import type { FleetSegmentKey } from "@/lib/admin/fleet-segments";
import { opsUrgencyFromNextDueDate, opsUrgencyRank } from "@/lib/admin/assignment-ops-urgency";
import { getGlobalFleetHealth } from "@/lib/admin/fleet-health";

import { prisma } from "@/lib/db";
import { isStripeBillingEnabled } from "@/lib/stripe/config";

const unlinkedInvoilessWhere = {
  invoilessCustomerId: null,
  billingAccounts: { none: { provider: "invoiless" as const } },
} as const;

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
  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());
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
    prisma.customer.count(),
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
      ? prisma.customer.count({ where: unlinkedInvoilessWhere })
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

  const attentionAssignments = attentionCandidates.slice(0, 6).map((c) => c.assignment);

  const stripeBillingIssueCount = stripeBillingIssues.length;

  const attentionCount =
    overdueAssignmentCount +
    dueSoonAssignmentCount +
    (invoilessConfigured ? unlinkedInvoilessCount : 0) +
    stripeBillingIssueCount;

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

  const attentionItems: DashboardAttentionItem[] = [];

  for (const a of attentionAssignments) {
    const name = displayName(a.customer);
    const urgent = opsUrgencyFromNextDueDate(a.nextDueDate) === "overdue";
    const duePart = a.nextDueDate
      ? `Next due ${formatShortDue(a.nextDueDate)}`
      : "Next due not set";
    attentionItems.push({
      id: a.id,
      title: urgent ? `Overdue service — ${name}` : `Due soon — ${name}`,
      meta: `${duePart} · IMEI ${a.device.imei}`,
      href: `/admin/customers/${a.customer.id}`,
      tone: urgent ? "urgent" : "warning",
    });
  }

  const attentionIds = new Set(attentionAssignments.map((a) => a.id));
  const upcomingBillItems: DashboardAttentionItem[] = [];
  for (const a of upcomingBillAssignments) {
    if (attentionIds.has(a.id)) continue;
    if (!a.nextDueDate) continue;
    const name = displayName(a.customer);
    upcomingBillItems.push({
      id: `up-${a.id}`,
      title: `Next bill — ${name}`,
      meta: `Due ${formatShortDue(a.nextDueDate)} · IMEI ${a.device.imei}`,
      href: `/admin/customers/${a.customer.id}`,
      tone: "info",
    });
    if (upcomingBillItems.length >= 6) break;
  }

  for (const account of stripeBillingIssues) {
    if (attentionItems.length >= 6) break;
    const name = displayName(account.customer);
    attentionItems.push({
      id: `stripe-${account.id}`,
      title: `Stripe ${account.status} — ${name}`,
      meta: "Open billing on the customer edit screen.",
      href: `/admin/customers/${account.customer.id}/edit`,
      tone: "urgent",
    });
  }

  if (invoilessConfigured && unlinkedInvoilessCount > 0) {
    const unlinked = await prisma.customer.findMany({
      where: unlinkedInvoilessWhere,
      take: Math.min(3, 6 - attentionItems.length),
      orderBy: { updatedAt: "desc" },
      select: { id: true, company: true, firstName: true, lastName: true },
    });
    for (const c of unlinked) {
      if (attentionItems.length >= 6) break;
      attentionItems.push({
        id: `inv-${c.id}`,
        title: `Invoiless not linked — ${displayName(c)}`,
        meta: "Push customer from the edit screen when ready.",
        href: `/admin/customers/${c.id}/edit`,
        tone: "info",
      });
    }
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
