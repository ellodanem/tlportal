"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { createVendorBill, recordVendorBillPayment, updateVendorBill, voidVendorBill } from "@/lib/services/vendor-bill-service";
import type { ExpensePaymentMethod } from "@prisma/client";

export type BillActionState = { error?: string; ok?: boolean; next?: string; message?: string };

function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function dateValue(raw: string | null, label: string): Date | null {
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date;
}

async function readBill(formData: FormData) {
  const vendorId = text(formData, "vendorId");
  const total = Number(formData.get("total") ?? "");
  const billDate = dateValue(text(formData, "billDate"), "Bill date");
  const dueDate = dateValue(text(formData, "dueDate"), "Due date");
  if (!vendorId) throw new Error("Select a vendor.");
  if (!Number.isFinite(total) || total <= 0) throw new Error("Enter a valid bill total.");
  if (!billDate) throw new Error("Bill date is required.");
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, isActive: true } });
  if (!vendor) throw new Error("Vendor not found.");
  if (!vendor.isActive) throw new Error("Select an active vendor.");
  return {
    vendorId,
    vendorInvoiceNumber: text(formData, "vendorInvoiceNumber"),
    description: text(formData, "description"),
    currency: text(formData, "currency") ?? "XCD",
    total,
    billDate,
    dueDate,
    notes: text(formData, "notes"),
    status: String(formData.get("status") ?? "draft") === "open" ? "open" as const : "draft" as const,
  };
}

export async function saveVendorBillAction(_prev: BillActionState, formData: FormData): Promise<BillActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  try {
    const input = await readBill(formData);
    const billId = text(formData, "billId");
    if (billId) await updateVendorBill(billId, input);
    else {
      const id = await createVendorBill({ ...input, createdById: session.sub });
      revalidatePath("/admin/bills");
      return { ok: true, next: `/admin/bills/${id}` };
    }
    revalidateBillPaths(billId);
    return { ok: true, next: `/admin/bills/${billId}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save bill." };
  }
}

export async function recordVendorBillPaymentAction(_prev: BillActionState, formData: FormData): Promise<BillActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const billId = text(formData, "billId");
  const amount = Number(formData.get("amount") ?? "");
  const method = String(formData.get("method") ?? "bank_transfer") as ExpensePaymentMethod;
  const paidAt = dateValue(text(formData, "paidAt"), "Payment date");
  if (!billId) return { error: "Bill id is missing." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid payment amount." };
  if (!paidAt) return { error: "Payment date is required." };
  if (!(new Set<ExpensePaymentMethod>(["cash", "bank_transfer", "card", "cheque", "other"])).has(method)) return { error: "Invalid payment method." };
  try {
    const result = await recordVendorBillPayment({ billId, amount, method, paidAt, reference: text(formData, "reference"), notes: text(formData, "notes"), recordedById: session.sub });
    revalidateBillPaths(billId);
    return { ok: true, message: result.status === "paid" ? "Bill is fully paid." : `Payment recorded — ${result.amountDue.toFixed(2)} still due.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record payment." };
  }
}

export async function voidVendorBillAction(_prev: BillActionState, formData: FormData): Promise<BillActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const billId = text(formData, "billId");
  if (!billId) return { error: "Bill id is missing." };
  try {
    await voidVendorBill(billId);
    revalidateBillPaths(billId);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not void bill." };
  }
}

function revalidateBillPaths(billId: string) {
  revalidatePath("/admin/bills");
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/bills/${billId}`);
}
