"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { InvoilessConfigError } from "@/lib/invoiless/client";
import {
  assertInvoilessConfigured,
  createInvoilessInvoiceApi,
  deleteInvoilessInvoiceApi,
  updateInvoilessInvoiceApi,
  type InvoilessInvoiceScheduleKind,
} from "@/lib/invoiless/invoice-mutate";
import { parseLineItemsFromFormData } from "@/lib/invoiless/invoice-line-items";
import { prisma } from "@/lib/db";

import type { InvoiceCreateFormState, InvoiceDeleteState } from "./action-state";

export async function createInvoiceFromPortal(
  _prev: InvoiceCreateFormState,
  formData: FormData,
): Promise<InvoiceCreateFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You are not signed in." };
  }

  try {
    assertInvoilessConfigured();
  } catch (e) {
    if (e instanceof InvoilessConfigError) {
      return { error: "Invoiless is not configured (missing API key)." };
    }
    throw e;
  }

  const tlCustomerId = String(formData.get("tlCustomerId") ?? "").trim();
  if (!tlCustomerId) {
    return { error: "Choose a customer." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: tlCustomerId },
    select: { id: true, invoilessCustomerId: true },
  });
  if (!customer?.invoilessCustomerId) {
    return {
      error: "That customer is not linked to Invoiless. Sync them on the customer edit page first.",
    };
  }

  const parsedLines = parseLineItemsFromFormData(formData);
  if ("error" in parsedLines) {
    return { error: parsedLines.error };
  }

  const status = String(formData.get("status") ?? "Draft").trim() || "Draft";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim() || null;
  const scheduleRaw = String(formData.get("invoiceScheduleType") ?? "standard").trim();
  const scheduleType: InvoilessInvoiceScheduleKind = scheduleRaw === "retainer" ? "retainer" : "standard";

  try {
    await createInvoilessInvoiceApi({
      invoilessCustomerId: customer.invoilessCustomerId,
      items: parsedLines.items,
      status,
      notes,
      dueDate: dueDateRaw,
      scheduleType,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create invoice in Invoiless." };
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/customers/${customer.id}`);
  redirect("/admin/invoices");
}

export async function updateInvoiceFromPortal(
  _prev: InvoiceCreateFormState,
  formData: FormData,
): Promise<InvoiceCreateFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "You are not signed in." };
  }

  try {
    assertInvoilessConfigured();
  } catch (e) {
    if (e instanceof InvoilessConfigError) {
      return { error: "Invoiless is not configured (missing API key)." };
    }
    throw e;
  }

  const invoiceId = String(formData.get("invoilessInvoiceId") ?? "").trim();
  if (!invoiceId) {
    return { error: "Missing invoice id." };
  }

  const parsedLines = parseLineItemsFromFormData(formData);
  if ("error" in parsedLines) {
    return { error: parsedLines.error };
  }

  const status = String(formData.get("status") ?? "Draft").trim() || "Draft";
  const notes = String(formData.get("notes") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim() || null;
  const invoilessCustomerId = String(formData.get("invoilessCustomerId") ?? "").trim() || null;

  const invoiceDateRaw = String(formData.get("invoiceDate") ?? "").trim() || null;

  try {
    await updateInvoilessInvoiceApi({
      invoiceId,
      invoilessCustomerId,
      items: parsedLines.items,
      status,
      notes,
      invoiceDate: invoiceDateRaw,
      dueDate: dueDateRaw,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update invoice in Invoiless." };
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${encodeURIComponent(invoiceId)}/edit`);
  if (invoilessCustomerId) {
    const cust = await prisma.customer.findFirst({
      where: { invoilessCustomerId },
      select: { id: true },
    });
    if (cust) {
      revalidatePath(`/admin/customers/${cust.id}`);
    }
  }
  redirect("/admin/invoices");
}

export async function deleteInvoiceFromPortal(
  _prev: InvoiceDeleteState,
  formData: FormData,
): Promise<InvoiceDeleteState> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: "You are not signed in." };
  }

  try {
    assertInvoilessConfigured();
  } catch (e) {
    if (e instanceof InvoilessConfigError) {
      return { ok: false, error: "Invoiless is not configured." };
    }
    throw e;
  }

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) {
    return { ok: false, error: "Missing invoice id." };
  }

  try {
    await deleteInvoilessInvoiceApi(invoiceId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete invoice." };
  }

  revalidatePath("/admin/invoices");
  return { ok: true, error: null };
}
