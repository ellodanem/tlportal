import "server-only";

import type { FleetSegmentKey } from "@/lib/admin/fleet-segments";

import { prisma } from "@/lib/db";

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

export async function getDashboardStats() {
  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());

  const [
    fleetUnassigned,
    fleetProduction,
    fleetDemo,
    fleetPersonal,
    customerCount,
    assignedDeviceCount,
    inStockDeviceCount,
    suspendedDeviceCount,
    activeServiceCount,
    overdueAssignmentCount,
    dueSoonAssignmentCount,
    unlinkedInvoilessCount,
    attentionAssignments,
    upcomingBillAssignments,
    recentCustomers,
    pendingRegistrationCount,
    simDataSums,
    simCardCount,
  ] = await Promise.all([
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
    prisma.serviceAssignment.count({ where: { status: "overdue" } }),
    prisma.serviceAssignment.count({ where: { status: "due_soon" } }),
    invoilessConfigured
      ? prisma.customer.count({ where: { invoilessCustomerId: null } })
      : Promise.resolve(0),
    prisma.serviceAssignment.findMany({
      where: {
        status: { in: ["overdue", "due_soon"] },
        endDate: null,
      },
      take: 6,
      orderBy: [{ status: "asc" }, { nextDueDate: "asc" }],
      include: {
        customer: {
          select: { id: true, company: true, firstName: true, lastName: true },
        },
        device: { select: { imei: true } },
      },
    }),
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
  ]);

  const attentionCount =
    overdueAssignmentCount +
    dueSoonAssignmentCount +
    (invoilessConfigured ? unlinkedInvoilessCount : 0);

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
    const urgent = a.status === "overdue";
    const duePart = a.nextDueDate
      ? `Next due ${formatShortDue(a.nextDueDate)}`
      : "Next due not set";
    attentionItems.push({
      id: a.id,
      title: urgent ? `Overdue service — ${name}` : `Due soon — ${name}`,
      meta: `${duePart} · IMEI ${a.device.imei} · ${a.status.replace(/_/g, " ")}`,
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

  if (invoilessConfigured && unlinkedInvoilessCount > 0) {
    const unlinked = await prisma.customer.findMany({
      where: { invoilessCustomerId: null },
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
  };
}
