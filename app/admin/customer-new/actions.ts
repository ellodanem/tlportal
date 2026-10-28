"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { customerFormInitialState, type CustomerFormActionState } from "@/app/admin/customers/customer-form-state";
import { prisma } from "@/lib/db";
import { normalizeWhatsAppPhone } from "@/lib/twilio/phone";

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.length > 50 ? s.slice(0, 50) : s))
    .slice(0, 10);
}

/**
 * Creates a customer from the "Customer (New)" workspace and returns the user to it.
 * Profile fields only — subscriptions are created from the customer's subscription page.
 */
export async function createCustomerNew(
  _prev: CustomerFormActionState,
  formData: FormData,
): Promise<CustomerFormActionState> {
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const company = text(formData, "company");
  let phone = text(formData, "phone");

  if (!company && !(firstName && lastName)) {
    return { ...customerFormInitialState, error: "Enter a company name, or both first and last name." };
  }
  if (phone) {
    const normalized = normalizeWhatsAppPhone(phone);
    if (!normalized) {
      return {
        error: "Enter a valid WhatsApp-capable mobile number in international format (for example +1 758 555 1234).",
      };
    }
    phone = normalized;
  }

  let customerId: string;
  try {
    const customer = await prisma.customer.create({
      data: {
        firstName,
        lastName,
        company,
        email: text(formData, "email"),
        phone,
        address: text(formData, "address"),
        city: text(formData, "city"),
        state: text(formData, "state"),
        postalCode: text(formData, "postalCode"),
        country: text(formData, "country"),
        notes: text(formData, "notes"),
        tags: parseTags(text(formData, "tags")),
      },
      select: { id: true },
    });
    customerId = customer.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create customer." };
  }

  revalidatePath("/admin/customer-new");
  revalidatePath("/admin/customers");
  redirect(`/admin/customer-new?c=${customerId}`);
}
