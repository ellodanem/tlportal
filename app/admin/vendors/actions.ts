"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export type VendorActionState = { error?: string; ok?: boolean; next?: string };

function value(formData: FormData, key: string): string | null {
  const text = String(formData.get(key) ?? "").trim();
  return text || null;
}

function readVendor(formData: FormData) {
  const name = value(formData, "name");
  const email = value(formData, "email");
  const phone = value(formData, "phone");
  const currency = (value(formData, "currency") ?? "XCD").toUpperCase();
  const paymentTermsRaw = Number(formData.get("paymentTerms") ?? 30);
  const notes = value(formData, "notes");
  if (!name) return { error: "Vendor name is required." } as const;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid vendor email address." } as const;
  if (!Number.isInteger(paymentTermsRaw) || paymentTermsRaw < 0 || paymentTermsRaw > 365) {
    return { error: "Payment terms must be between 0 and 365 days." } as const;
  }
  return {
    data: { name: name.slice(0, 200), email, phone, currency: currency.slice(0, 8), paymentTerms: paymentTermsRaw, notes },
  } as const;
}

async function duplicateName(name: string, excludeId?: string) {
  return prisma.vendor.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

export async function createVendorAction(_prev: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const parsed = readVendor(formData);
  if ("error" in parsed) return parsed;
  if (await duplicateName(parsed.data.name)) return { error: "A vendor with that name already exists." };

  const vendor = await prisma.vendor.create({ data: parsed.data, select: { id: true } });
  revalidatePath("/admin/vendors");
  return { ok: true, next: `/admin/vendors/${vendor.id}` };
}

export async function updateVendorAction(_prev: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const id = value(formData, "vendorId");
  if (!id) return { error: "Vendor id is missing." };
  const parsed = readVendor(formData);
  if ("error" in parsed) return parsed;
  if (!(await prisma.vendor.findUnique({ where: { id }, select: { id: true } }))) return { error: "Vendor not found." };
  if (await duplicateName(parsed.data.name, id)) return { error: "A vendor with that name already exists." };

  await prisma.vendor.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${id}`);
  revalidatePath("/admin/expenses");
  return { ok: true, next: `/admin/vendors/${id}` };
}

export async function toggleVendorStatusAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = value(formData, "vendorId");
  if (!id) return;
  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { isActive: true } });
  if (!vendor) return;
  await prisma.vendor.update({ where: { id }, data: { isActive: !vendor.isActive } });
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${id}`);
}
