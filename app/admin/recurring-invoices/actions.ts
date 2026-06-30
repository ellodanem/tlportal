"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import {
  parseRecurringScheduleRequestBody,
  type RecurringScheduleRequestPayload,
} from "@/lib/billing/recurring-schedule-payload";
import type { CreateRecurringScheduleInput } from "@/lib/services/native-recurring-schedule-service";
import {
  createRecurringSchedule,
  generateInvoiceFromSchedule,
  setRecurringScheduleStatus,
  updateRecurringSchedule,
} from "@/lib/services/native-recurring-schedule-service";

export type SaveRecurringScheduleState = { error?: string; ok?: boolean; scheduleId?: string; next?: string };
export type ScheduleStatusState = { error?: string; ok?: boolean; message?: string };
export type RunScheduleNowState = { error?: string; ok?: boolean; message?: string };

function payloadToInput(
  payload: RecurringScheduleRequestPayload,
  createdById?: string | null,
): CreateRecurringScheduleInput {
  const billToLines = payload.billToLines ?? [];
  return {
    name: payload.name,
    customerId: payload.customerId,
    billToName: billToLines[0] ?? null,
    billToLines,
    currency: payload.currency,
    notes: payload.notes,
    paymentInstructions: payload.paymentInstructions,
    intervalMonths: payload.intervalMonths,
    nextIssueDate: new Date(`${payload.nextIssueDate}T12:00:00.000Z`),
    dueDaysAfterIssue: payload.dueDaysAfterIssue,
    autoEmail: payload.autoEmail,
    emailTo: payload.emailTo,
    serviceAssignmentId: payload.serviceAssignmentId,
    createdById: createdById ?? null,
    lineItems: payload.lineItems.map((line, index) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      sortOrder: index,
    })),
  };
}

function parsePayloadFromForm(formData: FormData): ReturnType<typeof parseRecurringScheduleRequestBody> {
  const raw = String(formData.get("schedulePayloadJson") ?? "").trim();
  if (!raw) return { error: "Schedule data is missing." };
  try {
    return parseRecurringScheduleRequestBody(JSON.parse(raw) as unknown);
  } catch {
    return { error: "Schedule data is invalid." };
  }
}

export async function saveRecurringScheduleAction(
  _prev: SaveRecurringScheduleState,
  formData: FormData,
): Promise<SaveRecurringScheduleState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const parsed = parsePayloadFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  const input = payloadToInput(parsed.payload, session.sub);

  try {
    if (scheduleId) {
      await updateRecurringSchedule(scheduleId, input);
      revalidatePath("/admin/recurring-invoices");
      revalidatePath(`/admin/recurring-invoices/${scheduleId}`);
      return { ok: true, scheduleId, next: `/admin/recurring-invoices/${scheduleId}` };
    }
    const id = await createRecurringSchedule(input);
    revalidatePath("/admin/recurring-invoices");
    return { ok: true, scheduleId: id, next: `/admin/recurring-invoices/${id}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save schedule." };
  }
}

export async function pauseRecurringScheduleAction(
  _prev: ScheduleStatusState,
  formData: FormData,
): Promise<ScheduleStatusState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  if (!scheduleId) return { error: "Schedule id is missing." };

  try {
    await setRecurringScheduleStatus(scheduleId, "paused");
    revalidatePath("/admin/recurring-invoices");
    revalidatePath(`/admin/recurring-invoices/${scheduleId}`);
    return { ok: true, message: "Schedule paused." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not pause schedule." };
  }
}

export async function resumeRecurringScheduleAction(
  _prev: ScheduleStatusState,
  formData: FormData,
): Promise<ScheduleStatusState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  if (!scheduleId) return { error: "Schedule id is missing." };

  try {
    await setRecurringScheduleStatus(scheduleId, "active");
    revalidatePath("/admin/recurring-invoices");
    revalidatePath(`/admin/recurring-invoices/${scheduleId}`);
    return { ok: true, message: "Schedule resumed." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not resume schedule." };
  }
}

export async function endRecurringScheduleAction(
  _prev: ScheduleStatusState,
  formData: FormData,
): Promise<ScheduleStatusState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  if (!scheduleId) return { error: "Schedule id is missing." };

  try {
    await setRecurringScheduleStatus(scheduleId, "ended");
    revalidatePath("/admin/recurring-invoices");
    revalidatePath(`/admin/recurring-invoices/${scheduleId}`);
    return { ok: true, message: "Schedule ended." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not end schedule." };
  }
}

export async function runRecurringScheduleNowAction(
  _prev: RunScheduleNowState,
  formData: FormData,
): Promise<RunScheduleNowState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  if (!scheduleId) return { error: "Schedule id is missing." };

  try {
    const result = await generateInvoiceFromSchedule(scheduleId, new Date(), { force: true });
    revalidatePath("/admin/recurring-invoices");
    revalidatePath(`/admin/recurring-invoices/${scheduleId}`);
    revalidatePath("/admin/tl-invoices");
    revalidatePath(`/admin/tl-invoices/${result.invoiceId}`);
    const emailNote = result.emailed
      ? " Emailed to customer."
      : result.emailError
        ? ` Email not sent: ${result.emailError}`
        : "";
    return { ok: true, message: `Invoice generated.${emailNote}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not generate invoice." };
  }
}
