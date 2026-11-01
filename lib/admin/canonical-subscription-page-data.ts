import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  canonicalSubscriptionUiEnabled,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";
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

export async function loadManageableServiceOperationTargets(subscription: SubscriptionDetail, canManage: boolean) {
  if (!canManage) return { transferTargets: [], replacementAssignments: [] };
  return loadServiceOperationTargets(subscription.customerId, subscription.id);
}
