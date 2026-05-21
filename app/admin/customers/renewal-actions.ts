"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import {
  listActiveAssignmentsForRenewal,
  markAssignmentPeriodPaid,
} from "@/lib/services/assignment-renewal-service";
import { formatAssignmentDateLabel } from "@/lib/domain/assignment-renewal";
import { formatPlanTerm } from "@/lib/subscription-options/display";

export type RenewalActionState = {
  error: string | null;
  message?: string;
};

const initial: RenewalActionState = { error: null };

function revalidateRenewalPaths(customerId: string, deviceId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/billing`);
  if (deviceId) {
    revalidatePath("/admin/devices");
    revalidatePath(`/admin/devices/${deviceId}/edit`);
  }
}

export async function markAssignmentPeriodPaidAction(
  _prev: RenewalActionState,
  formData: FormData,
): Promise<RenewalActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const deviceId = String(formData.get("deviceId") ?? "").trim() || undefined;
  const invoiceRef = String(formData.get("invoiceRef") ?? "").trim() || null;

  if (!assignmentId || !customerId) {
    return { error: "Missing assignment or customer." };
  }

  const result = await markAssignmentPeriodPaid({
    assignmentId,
    source: "manual",
    invoiceRef,
    actorUserId: session.sub,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateRenewalPaths(customerId, deviceId || result.deviceId);

  if (result.alreadyRecorded) {
    return {
      error: null,
      message: `This assignment was already recorded for that invoice reference. Next due remains ${formatAssignmentDateLabel(result.newNextDue)}.`,
    };
  }

  const prev = formatAssignmentDateLabel(result.previousNextDue);
  const next = formatAssignmentDateLabel(result.newNextDue);
  return {
    error: null,
    message:
      result.previousNextDue != null
        ? `Period marked paid. Next due advanced from ${prev} to ${next}.`
        : `Period marked paid. Next due set to ${next}.`,
  };
}

export async function markAllCustomerAssignmentsPaidAction(
  _prev: RenewalActionState,
  formData: FormData,
): Promise<RenewalActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const invoiceRef = String(formData.get("invoiceRef") ?? "").trim() || null;
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const assignments = await listActiveAssignmentsForRenewal(customerId);

  if (assignments.length === 0) {
    return { error: "No active device assignments to update." };
  }

  let ok = 0;
  const errors: string[] = [];

  for (const a of assignments) {
    const result = await markAssignmentPeriodPaid({
      assignmentId: a.id,
      source: "manual",
      invoiceRef,
      actorUserId: session.sub,
    });
    if (result.ok && !result.alreadyRecorded) {
      ok += 1;
    } else if (!result.ok) {
      errors.push(result.error);
    }
  }

  revalidateRenewalPaths(customerId);

  if (ok === 0 && errors.length > 0) {
    return { error: errors[0] ?? "Could not mark assignments paid." };
  }

  return {
    error: null,
    message: `Marked ${ok} assignment${ok === 1 ? "" : "s"} paid${invoiceRef ? ` (ref ${invoiceRef})` : ""}.${errors.length ? ` ${errors.length} skipped (set billing term on device).` : ""}`,
  };
}

export { initial as renewalActionInitialState };
