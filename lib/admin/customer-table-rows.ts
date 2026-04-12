import type { ServiceAssignmentStatus } from "@prisma/client";

import type { CustomerTableRow } from "@/components/admin/customers-table";
import {
  customerDisplayName,
  customerInitials,
  earliestNextDue,
  rollupFromAssignments,
  tagsPreview,
} from "@/lib/admin/customer-list";

type CustomerWithAssignments = {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  invoilessCustomerId: string | null;
  tags: string[];
  updatedAt: Date;
  serviceAssignments: {
    status: ServiceAssignmentStatus;
    endDate: Date | null;
    nextDueDate: Date | null;
    deviceId: string;
  }[];
};

export function buildCustomerTableRows(customers: CustomerWithAssignments[]): CustomerTableRow[] {
  const rows: CustomerTableRow[] = customers.map((c) => {
    const open = c.serviceAssignments.filter((a) => a.endDate == null && a.status !== "cancelled");
    const distinctDevices = new Set(open.map((a) => a.deviceId)).size;
    const nextDue = earliestNextDue(open);
    return {
      id: c.id,
      displayName: customerDisplayName(c),
      initials: customerInitials(c),
      subtitle: c.email?.trim() || c.phone?.trim() || "—",
      tagsLine: tagsPreview(c.tags),
      activeServices: open.length,
      distinctDevices,
      nextDue,
      invoilessLinked: Boolean(c.invoilessCustomerId),
      rollup: rollupFromAssignments(open),
      updatedAt: c.updatedAt,
    };
  });

  rows.sort((a, b) => {
    if (a.nextDue && b.nextDue) return a.nextDue.getTime() - b.nextDue.getTime();
    if (a.nextDue) return -1;
    if (b.nextDue) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return rows;
}
