"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Prisma } from "@prisma/client";

import { customerFormInitialState, type CustomerFormActionState } from "@/app/admin/customers/customer-form-state";
import { customerNewHref } from "@/lib/admin/customer-new";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { archiveCustomer, unarchiveCustomer } from "@/lib/services/customer-archive-service";
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

function readCustomerFields(formData: FormData) {
  return {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    company: text(formData, "company"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country"),
    legalInfo: text(formData, "legalInfo"),
    invoiceCc: text(formData, "invoiceCc"),
    invoiceBcc: text(formData, "invoiceBcc"),
    traqcarePortalUrl: text(formData, "traqcarePortalUrl"),
    traqcareClientId: text(formData, "traqcareClientId"),
    notes: text(formData, "notes"),
    tags: parseTags(text(formData, "tags")),
  };
}

function revalidateCustomerNew(customerId: string) {
  revalidatePath("/admin/customer-new");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath("/admin/devices");
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

  revalidateCustomerNew(customerId);
  redirect(customerNewHref({ c: customerId }));
}

/** Restores an archived customer from the "Customer (New)" workspace and keeps the user there. */
export async function restoreCustomerNew(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const result = await unarchiveCustomer(id, session.sub ?? null);
  if (!result.ok) {
    redirect(customerNewHref({ c: id, filter: "archived", restoreError: result.error }));
  }

  revalidatePath("/admin");
  revalidateCustomerNew(id);
  redirect(customerNewHref({ c: id }));
}

export async function updateCustomerNew(
  _prev: CustomerFormActionState,
  formData: FormData,
): Promise<CustomerFormActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing customer id." };

  const fields = readCustomerFields(formData);
  const section = String(formData.get("section") ?? "").trim();

  let data: Prisma.CustomerUpdateInput;
  if (section === "gps") {
    data = {
      traqcarePortalUrl: fields.traqcarePortalUrl,
      traqcareClientId: fields.traqcareClientId,
    };
  } else {
    if (!fields.company && !(fields.firstName && fields.lastName)) {
      return { error: "Enter a company name, or both first and last name." };
    }
    if (fields.phone) {
      const normalized = normalizeWhatsAppPhone(fields.phone);
      if (!normalized) {
        return {
          error:
            "Enter a valid WhatsApp-capable mobile number in international format (for example +1 758 555 1234).",
        };
      }
      fields.phone = normalized;
    }
    data = {
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
      notes: fields.notes,
      tags: fields.tags,
    };
  }

  try {
    await prisma.customer.update({ where: { id }, data });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update customer." };
  }

  revalidateCustomerNew(id);
  redirect(customerNewHref({ c: id }));
}

export async function archiveCustomerNew(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const result = await archiveCustomer(id, session.sub ?? null);
  if (!result.ok) {
    redirect(customerNewHref({ c: id, archiveError: result.error }));
  }

  revalidatePath("/admin");
  revalidateCustomerNew(id);
  redirect(customerNewHref({ c: id, filter: "archived" }));
}

export async function deleteCustomerNew(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.customer.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/admin/customer-new");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/devices");
  redirect("/admin/customer-new");
}
