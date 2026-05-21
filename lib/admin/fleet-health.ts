import "server-only";

import type { DeviceStatus, ServiceAssignmentStatus } from "@prisma/client";

import { opsUrgencyFromNextDueDate, type OpsUrgency } from "@/lib/admin/assignment-ops-urgency";
import { prisma } from "@/lib/db";
import { isStripeBillingEnabled } from "@/lib/stripe/config";

export type FleetHealthBucket = "healthy" | "renewal" | "review";

export type FleetHealthCounts = {
  total: number;
  healthy: number;
  renewal: number;
  review: number;
};

export type FleetHealthReviewReason =
  | "assignment_suspended"
  | "device_suspended"
  | "missing_sim"
  | "sim_not_active"
  | "missing_gps_link"
  | "stripe_billing";

export type FleetHealthAssignmentInput = {
  id: string;
  status: ServiceAssignmentStatus;
  nextDueDate: Date | null;
  device: {
    id: string;
    status: DeviceStatus;
    simCard: { status: string } | null;
    providerDeviceLinks: { unlinkedAt: Date | null }[];
  };
  simCard: { status: string } | null;
};

export type FleetHealthClassification = {
  bucket: FleetHealthBucket;
  renewalUrgency: OpsUrgency;
  reviewReasons: FleetHealthReviewReason[];
};

function simForAssignment(a: FleetHealthAssignmentInput) {
  return a.device.simCard ?? a.simCard;
}

function hasActiveGpsLink(a: FleetHealthAssignmentInput) {
  return a.device.providerDeviceLinks.some((l) => l.unlinkedAt == null);
}

function isSimActive(status: string | undefined | null) {
  if (!status?.trim()) return false;
  return status.trim().toLowerCase() === "active";
}

/** Mutually exclusive bucket per open assignment (review > renewal > healthy). */
export function classifyOpenAssignment(
  a: FleetHealthAssignmentInput,
  options?: { stripeBillingAttention?: boolean },
): FleetHealthClassification {
  const reviewReasons: FleetHealthReviewReason[] = [];
  const renewalUrgency = opsUrgencyFromNextDueDate(a.nextDueDate);

  if (a.status === "suspended") {
    reviewReasons.push("assignment_suspended");
  }
  if (a.device.status === "suspended") {
    reviewReasons.push("device_suspended");
  }
  const sim = simForAssignment(a);
  if (!sim) {
    reviewReasons.push("missing_sim");
  } else if (!isSimActive(sim.status)) {
    reviewReasons.push("sim_not_active");
  }
  if (!hasActiveGpsLink(a)) {
    reviewReasons.push("missing_gps_link");
  }
  if (options?.stripeBillingAttention) {
    reviewReasons.push("stripe_billing");
  }

  if (reviewReasons.length > 0) {
    return { bucket: "review", renewalUrgency, reviewReasons };
  }
  if (renewalUrgency === "due_soon" || renewalUrgency === "overdue") {
    return { bucket: "renewal", renewalUrgency, reviewReasons };
  }
  return { bucket: "healthy", renewalUrgency, reviewReasons };
}

export function emptyFleetHealthCounts(): FleetHealthCounts {
  return { total: 0, healthy: 0, renewal: 0, review: 0 };
}

export function fleetHealthCountsFromClassifications(
  classifications: FleetHealthClassification[],
): FleetHealthCounts {
  const counts = emptyFleetHealthCounts();
  counts.total = classifications.length;
  for (const c of classifications) {
    counts[c.bucket] += 1;
  }
  return counts;
}

export function fleetHealthPercent(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

const openAssignmentInclude = {
  device: {
    select: {
      id: true,
      status: true,
      imei: true,
      label: true,
      simCard: { select: { status: true } },
      providerDeviceLinks: {
        where: { unlinkedAt: null },
        select: { unlinkedAt: true },
      },
    },
  },
  simCard: { select: { status: true } },
  customer: {
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

export type FleetHealthReviewRow = {
  assignmentId: string;
  customerId: string;
  customerName: string;
  deviceLabel: string;
  imei: string;
  reasons: FleetHealthReviewReason[];
  href: string;
};

export async function getGlobalFleetHealth() {
  const stripeConfigured = isStripeBillingEnabled();
  const [assignments, stripeIssueCustomerIds] = await Promise.all([
    prisma.serviceAssignment.findMany({
      where: { endDate: null, status: { not: "cancelled" } },
      include: openAssignmentInclude,
    }),
    stripeConfigured
      ? prisma.billingAccount
          .findMany({
            where: { provider: "stripe", status: { in: ["past_due", "unpaid"] } },
            select: { customerId: true },
          })
          .then((rows) => new Set(rows.map((r) => r.customerId)))
      : Promise.resolve(new Set<string>()),
  ]);

  const classifications = assignments.map((a) =>
    classifyOpenAssignment(a, {
      stripeBillingAttention: stripeIssueCustomerIds.has(a.customerId),
    }),
  );

  const counts = fleetHealthCountsFromClassifications(classifications);

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

  const reviewRows: FleetHealthReviewRow[] = [];
  for (let i = 0; i < assignments.length; i++) {
    const c = classifications[i];
    if (c.bucket !== "review") continue;
    const a = assignments[i];
    reviewRows.push({
      assignmentId: a.id,
      customerId: a.customer.id,
      customerName: displayName(a.customer),
      deviceLabel: a.device.label?.trim() || "Unnamed device",
      imei: a.device.imei,
      reasons: c.reviewReasons,
      href: `/admin/customers/${a.customer.id}`,
    });
  }

  reviewRows.sort((x, y) => x.customerName.localeCompare(y.customerName));

  return { counts, reviewRows: reviewRows.slice(0, 8) };
}

export function classifyCustomerAssignments(
  assignments: FleetHealthAssignmentInput[],
  options?: { stripeBillingAttention?: boolean },
) {
  return assignments.map((a) => classifyOpenAssignment(a, options));
}

export function reviewReasonLabel(reason: FleetHealthReviewReason): string {
  switch (reason) {
    case "assignment_suspended":
      return "Service suspended";
    case "device_suspended":
      return "Device suspended";
    case "missing_sim":
      return "No SIM linked";
    case "sim_not_active":
      return "SIM not active";
    case "missing_gps_link":
      return "No GPS provider link";
    case "stripe_billing":
      return "Stripe payment issue";
    default:
      return reason;
  }
}
