import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  canonicalSubscriptionUiEnabled,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";
import {
  buildServiceHistory,
  SERVICE_HISTORY_AUDIT_CATEGORIES,
  type ServiceHistoryRow,
} from "@/lib/domain/canonical-service-history";
import {
  advancedSectionsFor,
  type AdvancedSections,
} from "@/lib/domain/canonical-subscription-navigation";
import {
  canonicalSubscriptionUiStaffViewer,
  getCanonicalSubscriptionAdminDetail,
} from "@/lib/services/canonical-subscription-admin-service";

/** One detail load per request, shared by the layout and the active tab. */
export const loadSubscriptionDetail = cache(async (subscriptionId: string) => getCanonicalSubscriptionAdminDetail(subscriptionId));

export type SubscriptionDetail = NonNullable<Awaited<ReturnType<typeof loadSubscriptionDetail>>>;

export type SubscriptionPermissions = {
  /** Draft subscriptions whose commercial details can still be edited directly. */
  editable: boolean;
  /** Canonical, operational or draft: the manager may change services and lifecycle. */
  canManage: boolean;
  advanced: AdvancedSections;
};

export function resolveSubscriptionPermissions(subscription: SubscriptionDetail): SubscriptionPermissions {
  const editable = subscription.access === "editable_draft"
    && (canonicalSubscriptionUiEnabled() || (subscription.controlMode === "canonical" && canonicalSubscriptionUiVisible()));
  const canManage = subscription.controlMode === "canonical"
    && ["editable_draft", "canonical_operational"].includes(subscription.access)
    && (canonicalSubscriptionUiEnabled() || canonicalSubscriptionUiVisible());
  const advanced = advancedSectionsFor({
    controlMode: subscription.controlMode,
    collectionMethod: subscription.collectionMethod,
    providerLinkCount: subscription.providerLinks.length,
    billingOperationCount: subscription.billingOperations.length,
    migrationSourceKind: subscription.canonicalMigrationLedger?.sourceKind ?? null,
  });
  return { editable, canManage, advanced };
}

/**
 * Shared gate for every subscription detail route. Layouts are not re-rendered on sibling
 * navigation, so each page must call this itself rather than relying on the layout.
 */
export async function requireSubscriptionPage(subscriptionId: string) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const subscription = await loadSubscriptionDetail(subscriptionId);
  if (!subscription) notFound();
  return { subscription, permissions: resolveSubscriptionPermissions(subscription) };
}

/** Targets for service-level operations; empty unless the viewer may manage the subscription. */
export const loadServiceOperationTargets = cache(async (customerId: string, subscriptionId: string) => {
  const [transferTargets, replacementAssignments] = await Promise.all([
    prisma.customerSubscription.findMany({
      where: { customerId, id: { not: subscriptionId }, controlMode: "canonical", lifecycleStatus: { in: ["draft", "pending_activation", "active", "paused"] }, canonicalMigrationLedger: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, reference: true },
    }),
    prisma.serviceAssignment.findMany({
      where: { customerId, subscriptionItemId: null, endDate: null, status: { not: "cancelled" } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: { id: true, device: { select: { label: true, deviceModel: { select: { name: true } } } } },
    }),
  ]);
  return {
    transferTargets: transferTargets.map((target) => ({ id: target.id, label: target.name?.trim() || target.reference || "Subscription agreement" })),
    replacementAssignments: replacementAssignments.map((assignment) => ({ id: assignment.id, label: assignment.device.label?.trim() || assignment.device.deviceModel.name })),
  };
});

const ITEM_SCOPED_HISTORY_CATEGORIES = SERVICE_HISTORY_AUDIT_CATEGORIES.filter((category) => category.startsWith("subscription."));
const DEVICE_SCOPED_HISTORY_CATEGORIES = SERVICE_HISTORY_AUDIT_CATEGORIES.filter((category) => category.startsWith("sim."));

/**
 * Complete, read-only history for one service: its effective-dated rates and hardware assignments
 * (already on the detail) plus the audit events that the existing operations recorded for it.
 * Nothing is written or merged; this only reads.
 */
export async function loadServiceHistory(item: SubscriptionDetail["items"][number]): Promise<ServiceHistoryRow[]> {
  const assignmentIds = new Set(item.serviceAssignments.map((assignment) => assignment.id));
  const deviceIds = [...new Set(item.serviceAssignments.map((assignment) => assignment.device.id))];
  let found: { id: string; occurredAt: Date; category: string; deviceId: string | null; payload: unknown }[];
  try {
    found = await prisma.operationalEvent.findMany({
      where: {
        OR: [
          { category: { in: [...ITEM_SCOPED_HISTORY_CATEGORIES] }, payload: { path: ["subscriptionItemId"], equals: item.id } },
          ...(deviceIds.length ? [{ category: { in: [...DEVICE_SCOPED_HISTORY_CATEGORIES] }, deviceId: { in: deviceIds } }] : []),
        ],
      },
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      take: 200,
      select: { id: true, occurredAt: true, category: true, deviceId: true, payload: true },
    });
  } catch (error) {
    // The audit log only adds detail. If it cannot be read, the pricing, assignment and lifecycle
    // records still describe the service, so the page must not fail because of it.
    console.error("Service history audit events could not be loaded", error);
    return buildServiceHistory({ item });
  }
  // A SIM change is a device-level event; keep only those made while the device served this service.
  const events = found.filter((event) => {
    if (!event.category.startsWith("sim.")) return true;
    const assignmentId = (event.payload as { assignmentId?: unknown } | null)?.assignmentId;
    return typeof assignmentId === "string" && assignmentIds.has(assignmentId);
  });
  const simIds = new Set<string>();
  for (const event of events) {
    const payload = event.payload as { previousSimId?: unknown; nextSimId?: unknown } | null;
    for (const value of [payload?.previousSimId, payload?.nextSimId]) if (typeof value === "string") simIds.add(value);
  }
  const sims = simIds.size
    ? await prisma.simCard.findMany({ where: { id: { in: [...simIds] } }, select: { id: true, iccid: true } })
    : [];
  return buildServiceHistory({ item, events, simLabels: Object.fromEntries(sims.map((sim) => [sim.id, `SIM ${sim.iccid}`])) });
}

export async function loadManageableServiceOperationTargets(subscription: SubscriptionDetail, canManage: boolean) {
  if (!canManage) return { transferTargets: [], replacementAssignments: [] };
  return loadServiceOperationTargets(subscription.customerId, subscription.id);
}
