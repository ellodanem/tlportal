import type { CustomerBillingMode, ServiceAssignmentStatus } from "@prisma/client";

import type { CustomerTableRow } from "@/components/admin/customers-table";
import { opsUrgencyFromNextDueDate, type OpsUrgency } from "@/lib/admin/assignment-ops-urgency";
import {
  customerDisplayName,
  customerInitials,
  earliestNextDue,
  rollupFromAssignments,
  tagsPreview,
} from "@/lib/admin/customer-list";

export type CustomerTableDeviceRow = {
  assignmentId: string;
  deviceId: string;
  deviceLabel: string;
  imei: string;
  nextDueDate: string | null;
  urgency: OpsUrgency;
};

type CustomerWithAssignments = {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  invoilessCustomerId: string | null;
  billingMode: CustomerBillingMode;
  tags: string[];
  updatedAt: Date;
  billingAccounts: { provider: "invoiless" | "stripe"; externalCustomerId: string | null; status: string | null }[];
  serviceAssignments: {
    id: string;
    status: ServiceAssignmentStatus;
    endDate: Date | null;
    nextDueDate: Date | null;
    deviceId: string;
    device: { imei: string; label: string | null };
  }[];
};

function deviceFriendlyLabel(label: string | null | undefined, imei: string): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  return imei;
}

export function buildCustomerTableRows(customers: CustomerWithAssignments[]): CustomerTableRow[] {
  const rows: CustomerTableRow[] = customers.map((c) => {
    const open = c.serviceAssignments.filter((a) => a.endDate == null && a.status !== "cancelled");
    const distinctDevices = new Set(open.map((a) => a.deviceId)).size;
    const nextDue = earliestNextDue(open);
    const stripeAccount = c.billingAccounts.find((a) => a.provider === "stripe");
    const invoilessAccount = c.billingAccounts.find((a) => a.provider === "invoiless");
    const invoilessLinked = Boolean(c.invoilessCustomerId || invoilessAccount?.externalCustomerId);
    const devices: CustomerTableDeviceRow[] = open.map((a) => ({
      assignmentId: a.id,
      deviceId: a.deviceId,
      deviceLabel: deviceFriendlyLabel(a.device.label, a.device.imei),
      imei: a.device.imei,
      nextDueDate: a.nextDueDate?.toISOString() ?? null,
      urgency: opsUrgencyFromNextDueDate(a.nextDueDate),
    }));
    return {
      id: c.id,
      displayName: customerDisplayName(c),
      initials: customerInitials(c),
      subtitle: c.email?.trim() || c.phone?.trim() || "—",
      tagsLine: tagsPreview(c.tags),
      activeServices: open.length,
      distinctDevices,
      devices,
      nextDue,
      billingMode: c.billingMode,
      invoilessLinked,
      stripeStatus: stripeAccount?.status ?? null,
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
