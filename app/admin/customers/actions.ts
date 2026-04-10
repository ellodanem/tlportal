"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvoilessCustomer, updateInvoilessCustomer } from "@/lib/invoiless/customer-sync";
import { prisma } from "@/lib/db";

import type { CustomerFormActionState } from "./customer-form-state";

function parseTags(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.length > 50 ? s.slice(0, 50) : s))
    .slice(0, 10);
}

function readCustomerFields(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? "").trim() || null,
    lastName: String(formData.get("lastName") ?? "").trim() || null,
    company: String(formData.get("company") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    postalCode: String(formData.get("postalCode") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    legalInfo: String(formData.get("legalInfo") ?? "").trim() || null,
    invoiceCc: String(formData.get("invoiceCc") ?? "").trim() || null,
    invoiceBcc: String(formData.get("invoiceBcc") ?? "").trim() || null,
    traqcareUsername: String(formData.get("traqcareUsername") ?? "").trim() || null,
    traqcarePortalUrl: String(formData.get("traqcarePortalUrl") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    tags: parseTags(String(formData.get("tags") ?? "")),
  };
}

function readTraqcarePassword(formData: FormData): { clear: boolean; next: string | null } {
  const clearRaw = formData.get("traqcarePasswordClear");
  const clear = clearRaw === "on" || clearRaw === "true" || clearRaw === "1";
  const raw = String(formData.get("traqcarePassword") ?? "");
  const trimmed = raw.trim();
  return { clear, next: trimmed.length ? trimmed : null };
}

function validateNameOrCompany(fields: ReturnType<typeof readCustomerFields>): string | null {
  const hasCompany = Boolean(fields.company);
  const hasPerson = Boolean(fields.firstName && fields.lastName);
  if (!hasCompany && !hasPerson) {
    return "Enter a company name, or both first and last name.";
  }
  return null;
}

export async function createCustomer(
  _prev: CustomerFormActionState,
  formData: FormData,
): Promise<CustomerFormActionState> {
  const fields = readCustomerFields(formData);
  const v = validateNameOrCompany(fields);
  if (v) {
    return { error: v };
  }

  const traqcarePwd = readTraqcarePassword(formData);

  try {
    await prisma.customer.create({
      data: {
        firstName: fields.firstName,
        lastName: fields.lastName,
        company: fields.company,
        email: fields.email,
        phone: fields.phone,
        address: fields.address,
        city: fields.city,
        state: fields.state,
        postalCode: fields.postalCode,
        country: fields.country,
        legalInfo: fields.legalInfo,
        invoiceCc: fields.invoiceCc,
        invoiceBcc: fields.invoiceBcc,
        traqcareUsername: fields.traqcareUsername,
        traqcarePortalUrl: fields.traqcarePortalUrl,
        traqcarePassword: traqcarePwd.clear ? null : traqcarePwd.next,
        notes: fields.notes,
        tags: fields.tags,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create customer.";
    return { error: message };
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

export async function updateCustomer(
  _prev: CustomerFormActionState,
  formData: FormData,
): Promise<CustomerFormActionState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing customer id." };
  }

  const fields = readCustomerFields(formData);
  const traqcarePwd = readTraqcarePassword(formData);
  const v = validateNameOrCompany(fields);
  if (v) {
    return { error: v };
  }

  try {
    const data: Prisma.CustomerUpdateInput = {
      firstName: fields.firstName,
      lastName: fields.lastName,
      company: fields.company,
      email: fields.email,
      phone: fields.phone,
      address: fields.address,
      city: fields.city,
      state: fields.state,
      postalCode: fields.postalCode,
      country: fields.country,
      legalInfo: fields.legalInfo,
      invoiceCc: fields.invoiceCc,
      invoiceBcc: fields.invoiceBcc,
      traqcareUsername: fields.traqcareUsername,
      traqcarePortalUrl: fields.traqcarePortalUrl,
      notes: fields.notes,
      tags: fields.tags,
    };
    if (traqcarePwd.clear) {
      data.traqcarePassword = null;
    } else if (traqcarePwd.next) {
      data.traqcarePassword = traqcarePwd.next;
    }

    await prisma.customer.update({
      where: { id },
      data,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update customer.";
    return { error: message };
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}`);
}

export async function deleteCustomer(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

export async function syncCustomerToInvoiless(customerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!process.env.INVOILESS_API_KEY?.trim()) {
    return { ok: false, error: "INVOILESS_API_KEY is not set." };
  }

  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) {
    return { ok: false, error: "Customer not found." };
  }

  try {
    if (c.invoilessCustomerId) {
      await updateInvoilessCustomer(c);
    } else {
      const { id: remoteId } = await createInvoilessCustomer(c);
      await prisma.customer.update({
        where: { id: c.id },
        data: { invoilessCustomerId: remoteId },
      });
    }
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    return { ok: false, error: message };
  }
}
