"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export type CustomerContactActionState = { error: string | null; ok?: boolean };

function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function readContact(formData: FormData) {
  return {
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    role: text(formData, "role"),
    notes: text(formData, "notes"),
    isBillingContact: formData.get("isBillingContact") === "1",
    isOperationsContact: formData.get("isOperationsContact") === "1",
    isMessageContact: formData.get("isMessageContact") === "1",
  };
}

function validate(contact: ReturnType<typeof readContact>): string | null {
  if (!contact.name && !contact.email && !contact.phone) {
    return "Add a name, email, or phone number for this contact.";
  }
  if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) {
    return "Enter a valid email address.";
  }
  return null;
}

async function requireCustomer(customerId: string) {
  return prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
}

export async function createCustomerContactAction(
  _prev: CustomerContactActionState,
  formData: FormData,
): Promise<CustomerContactActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const customerId = text(formData, "customerId");
  if (!customerId) return { error: "Missing customer." };
  const contact = readContact(formData);
  const error = validate(contact);
  if (error) return { error };
  if (!(await requireCustomer(customerId))) return { error: "Customer not found." };

  await prisma.customerContact.create({ data: { customerId, ...contact } });
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath(`/admin/customers/${customerId}`);
  return { error: null, ok: true };
}

export async function deleteCustomerContactAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const customerId = text(formData, "customerId");
  const contactId = text(formData, "contactId");
  if (!customerId || !contactId) return;
  await prisma.customerContact.deleteMany({ where: { id: contactId, customerId } });
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath(`/admin/customers/${customerId}`);
}
