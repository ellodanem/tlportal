"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvoilessCustomer, updateInvoilessCustomer } from "@/lib/invoiless/customer-sync";
import { prisma } from "@/lib/db";

export type ActionState = { error: string | null };

const initial: ActionState = { error: null };

function parseTags(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
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
    notes: String(formData.get("notes") ?? "").trim() || null,
    tags: parseTags(String(formData.get("tags") ?? "")),
  };
}

function validateNameOrCompany(fields: ReturnType<typeof readCustomerFields>): string | null {
  const hasCompany = Boolean(fields.company);
  const hasPerson = Boolean(fields.firstName && fields.lastName);
  if (!hasCompany && !hasPerson) {
    return "Enter a company name, or both first and last name.";
  }
  return null;
}

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fields = readCustomerFields(formData);
  const v = validateNameOrCompany(fields);
  if (v) {
    return { error: v };
  }

  try {
    await prisma.customer.create({
      data: {
        firstName: fields.firstName,
        lastName: fields.lastName,
        company: fields.company,
        email: fields.email,
        phone: fields.phone,
        address: fields.address,
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

export async function updateCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing customer id." };
  }

  const fields = readCustomerFields(formData);
  const v = validateNameOrCompany(fields);
  if (v) {
    return { error: v };
  }

  try {
    await prisma.customer.update({
      where: { id },
      data: {
        firstName: fields.firstName,
        lastName: fields.lastName,
        company: fields.company,
        email: fields.email,
        phone: fields.phone,
        address: fields.address,
        notes: fields.notes,
        tags: fields.tags,
      },
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

export const customerFormInitialState = initial;
