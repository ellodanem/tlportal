import "server-only";

import { prisma } from "@/lib/db";

export type DashboardAttentionItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  tone: "urgent" | "warning" | "info";
};

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
    deviceByStatus,
    customerCount,
    assignedDeviceCount,
    inStockDeviceCount,
    suspendedDeviceCount,
    activeServiceCount,
    overdueAssignmentCount,
    dueSoonAssignmentCount,
    unlinkedInvoilessCount,
    attentionAssignments,
    recentCustomers,
  ] = await Promise.all([
    prisma.device.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.customer.count(),
    prisma.device.count({ where: { status: "assigned" } }),
    prisma.device.count({ where: { status: "in_stock" } }),
    prisma.device.count({ where: { status: "suspended" } }),
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
  ]);

  const linkedInvoilessCount = invoilessConfigured
    ? await prisma.customer.count({ where: { invoilessCustomerId: { not: null } } })
    : 0;

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
    attentionItems.push({
      id: a.id,
      title: urgent ? `Overdue service — ${name}` : `Due soon — ${name}`,
      meta: `IMEI ${a.device.imei} · ${a.status.replace(/_/g, " ")}`,
      href: `/admin/customers/${a.customer.id}`,
      tone: urgent ? "urgent" : "warning",
    });
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

  const recentItems: DashboardRecentItem[] = recentCustomers.map((c) => ({
    id: c.id,
    label: `Customer updated — ${displayName(c)}`,
    sub: "Profile or billing fields changed",
    at: c.updatedAt,
    href: `/admin/customers/${c.id}`,
  }));

  const fleetByStatus = Object.fromEntries(
    deviceByStatus.map((r) => [r.status, r._count._all]),
  ) as Partial<Record<string, number>>;

  return {
    invoilessConfigured,
    fleetByStatus,
    customerCount,
    assignedDeviceCount,
    inStockDeviceCount,
    suspendedDeviceCount,
    activeServiceCount,
    overdueAssignmentCount,
    dueSoonAssignmentCount,
    unlinkedInvoilessCount,
    linkedInvoilessCount,
    attentionCount,
    attentionItems,
    recentItems,
  };
}
