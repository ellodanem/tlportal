"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import {
  listBillableAssignmentsForRenewal,
  markAssignmentPeriodPaid,
  updateAssignmentIntervalMonths,
  updateAssignmentNextDue,
} from "@/lib/services/assignment-renewal-service";
import { formatAssignmentDateLabel, parseAssignmentDateInput } from "@/lib/domain/assignment-renewal";
import { formatPlanTerm, parseSubscriptionIntervalMonths } from "@/lib/subscription-options/display";

import type { RenewalActionState } from "@/app/admin/customers/renewal-action-state";

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

function formatBillingTermLabel(months: number | null): string {
  return months != null ? formatPlanTerm(months) : "not set";
}

export async function updateAssignmentNextDueAction(
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
  const nextDueRaw = String(formData.get("nextDueDate") ?? "").trim();
  const nextDueDate = nextDueRaw ? parseAssignmentDateInput(nextDueRaw) : null;
  if (nextDueRaw && !nextDueDate) {
    return { error: "Invalid next due date." };
  }

  if (!assignmentId || !customerId) {
    return { error: "Missing assignment or customer." };
  }

  const result = await updateAssignmentNextDue({ assignmentId, nextDueDate });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateRenewalPaths(customerId, deviceId || result.deviceId);

  const prev = formatAssignmentDateLabel(result.previousNextDue);
  const next = formatAssignmentDateLabel(result.newNextDue);
  return {
    error: null,
    message:
      result.previousNextDue != null || result.newNextDue != null
        ? `Next due updated from ${prev} to ${next}.`
        : "Next due cleared.",
  };
}

export async function updateAllCustomerAssignmentsNextDueAction(
  _prev: RenewalActionState,
  formData: FormData,
): Promise<RenewalActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const nextDueRaw = String(formData.get("nextDueDate") ?? "").trim();
  const nextDueDate = nextDueRaw ? parseAssignmentDateInput(nextDueRaw) : null;
  if (nextDueRaw && !nextDueDate) {
    return { error: "Invalid next due date." };
  }

  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const assignments = await listBillableAssignmentsForRenewal(customerId);
  if (assignments.length === 0) {
    return { error: "No active device assignments to update." };
  }

  let ok = 0;
  const errors: string[] = [];

  for (const a of assignments) {
    const result = await updateAssignmentNextDue({ assignmentId: a.id, nextDueDate });
    if (result.ok) {
      ok += 1;
    } else {
      errors.push(result.error);
    }
  }

  revalidateRenewalPaths(customerId);

  if (ok === 0 && errors.length > 0) {
    return { error: errors[0] ?? "Could not update next due dates." };
  }

  const dateLabel = formatAssignmentDateLabel(nextDueDate);
  return {
    error: null,
    message: nextDueDate
      ? `Set next due to ${dateLabel} on ${ok} device${ok === 1 ? "" : "s"}.`
      : `Cleared next due on ${ok} device${ok === 1 ? "" : "s"}.`,
  };
}

export async function updateAssignmentBillingTermAction(
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
  const intervalRaw = String(formData.get("intervalMonths") ?? "");
  const intervalParsed = parseSubscriptionIntervalMonths(intervalRaw);
  if (!intervalParsed.ok) {
    return { error: intervalParsed.error };
  }

  if (!assignmentId || !customerId) {
    return { error: "Missing assignment or customer." };
  }

  const result = await updateAssignmentIntervalMonths({
    assignmentId,
    intervalMonths: intervalParsed.value,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateRenewalPaths(customerId, deviceId || result.deviceId);

  const prev = formatBillingTermLabel(result.previousIntervalMonths);
  const next = formatBillingTermLabel(result.newIntervalMonths);
  return {
    error: null,
    message: `Billing term updated from ${prev} to ${next}.`,
  };
}

export async function updateAllCustomerAssignmentsBillingTermAction(
  _prev: RenewalActionState,
  formData: FormData,
): Promise<RenewalActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const intervalRaw = String(formData.get("intervalMonths") ?? "");
  const intervalParsed = parseSubscriptionIntervalMonths(intervalRaw);
  if (!intervalParsed.ok) {
    return { error: intervalParsed.error };
  }

  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const assignments = await listBillableAssignmentsForRenewal(customerId);
  if (assignments.length === 0) {
    return { error: "No active device assignments to update." };
  }

  let ok = 0;
  const errors: string[] = [];

  for (const a of assignments) {
    const result = await updateAssignmentIntervalMonths({
      assignmentId: a.id,
      intervalMonths: intervalParsed.value,
    });
    if (result.ok) {
      ok += 1;
    } else {
      errors.push(result.error);
    }
  }

  revalidateRenewalPaths(customerId);

  if (ok === 0 && errors.length > 0) {
    return { error: errors[0] ?? "Could not update billing terms." };
  }

  const termLabel = formatBillingTermLabel(intervalParsed.value);
  return {
    error: null,
    message: `Set billing term to ${termLabel} on ${ok} device${ok === 1 ? "" : "s"}.`,
  };
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
  const nextDueOverrideRaw = String(formData.get("nextDueOverride") ?? "").trim();
  const nextDueOverride = nextDueOverrideRaw ? parseAssignmentDateInput(nextDueOverrideRaw) : null;
  if (nextDueOverrideRaw && !nextDueOverride) {
    return { error: "Invalid next due date." };
  }

  if (!assignmentId || !customerId) {
    return { error: "Missing assignment or customer." };
  }

  const result = await markAssignmentPeriodPaid({
    assignmentId,
    source: "manual",
    invoiceRef,
    nextDueOverride,
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
  const verb = result.usedOverride ? "set" : "advanced";
  return {
    error: null,
    message:
      result.previousNextDue != null
        ? `Period marked paid. Next due ${verb} from ${prev} to ${next}.`
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

  const assignments = await listBillableAssignmentsForRenewal(customerId);

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
