"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export type PortalUserFormState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

function readPassword(formData: FormData): { clear: boolean; next: string | null } {
  const clearRaw = formData.get("traqcarePasswordClear");
  const clear = clearRaw === "on" || clearRaw === "true" || clearRaw === "1";
  const raw = String(formData.get("traqcarePassword") ?? "");
  const trimmed = raw.trim();
  return { clear, next: trimmed.length ? trimmed : null };
}

function readPortalUserFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    traqcareUsername: String(formData.get("traqcareUsername") ?? "").trim() || null,
    role: String(formData.get("role") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function validatePortalUser(fields: ReturnType<typeof readPortalUserFields>): string | null {
  if (!fields.name && !fields.traqcareUsername && !fields.email) {
    return "Enter at least a name, Traqcare username, or email.";
  }
  return null;
}

function revalidateCustomer(customerId: string) {
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath("/admin/customers");
}

export async function createPortalUserAction(
  _prev: PortalUserFormState,
  formData: FormData,
): Promise<PortalUserFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "Not signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const fields = readPortalUserFields(formData);
  const v = validatePortalUser(fields);
  if (v) {
    return { error: v };
  }

  const pwd = readPassword(formData);

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return { error: "Customer not found." };
    }

    await prisma.customerPortalUser.create({
      data: {
        customerId,
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        traqcareUsername: fields.traqcareUsername,
        traqcarePassword: pwd.clear ? null : pwd.next,
        role: fields.role,
        notes: fields.notes,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not add portal user.";
    return { error: message };
  }

  revalidateCustomer(customerId);
  return { ok: true, message: "Portal user added." };
}

export async function updatePortalUserAction(
  _prev: PortalUserFormState,
  formData: FormData,
): Promise<PortalUserFormState> {
  const session = await getSession();
  if (!session) {
    return { error: "Not signed in." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!id || !customerId) {
    return { error: "Missing portal user id." };
  }

  const fields = readPortalUserFields(formData);
  const v = validatePortalUser(fields);
  if (v) {
    return { error: v };
  }

  const pwd = readPassword(formData);

  try {
    const existing = await prisma.customerPortalUser.findFirst({
      where: { id, customerId },
      select: { id: true },
    });
    if (!existing) {
      return { error: "Portal user not found." };
    }

    const data: Prisma.CustomerPortalUserUpdateInput = {
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      traqcareUsername: fields.traqcareUsername,
      role: fields.role,
      notes: fields.notes,
    };
    if (pwd.clear) {
      data.traqcarePassword = null;
    } else if (pwd.next) {
      data.traqcarePassword = pwd.next;
    }

    await prisma.customerPortalUser.update({
      where: { id },
      data,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update portal user.";
    return { error: message };
  }

  revalidateCustomer(customerId);
  return { ok: true, message: "Portal user saved." };
}

export async function deletePortalUserAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    return;
  }

  const id = String(formData.get("id") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!id || !customerId) {
    return;
  }

  await prisma.customerPortalUser.deleteMany({
    where: { id, customerId },
  });
  revalidateCustomer(customerId);
}
