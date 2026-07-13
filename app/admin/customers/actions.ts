"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { syncCustomerToInvoilessBilling } from "@/lib/services/billing-service";
import { archiveCustomer, unarchiveCustomer } from "@/lib/services/customer-archive-service";
import { enableCustomerBillingLifecycle } from "@/lib/services/billing-lifecycle-service";
import { isStripeBillingEnabled } from "@/lib/stripe/config";

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
    traqcarePortalUrl: String(formData.get("traqcarePortalUrl") ?? "").trim() || null,
    traqcareClientId: String(formData.get("traqcareClientId") ?? "").trim() || null,
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

export async function createCustomer(
  _prev: CustomerFormActionState,
  formData: FormData,
): Promise<CustomerFormActionState> {
  const fields = readCustomerFields(formData);
  const v = validateNameOrCompany(fields);
  if (v) {
    return { error: v };
  }

  const session = await getSession();
  const setupBilling = String(formData.get("setupBilling") ?? "") === "1";

  let customerId: string;
  try {
    const customer = await prisma.customer.create({
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
        traqcarePortalUrl: fields.traqcarePortalUrl,
        traqcareClientId: fields.traqcareClientId,
        notes: fields.notes,
        tags: fields.tags,
      },
    });
    customerId = customer.id;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create customer.";
    return { error: message };
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/billing`);

  if (!setupBilling) {
    redirect(`/admin/customers/${customerId}/billing`);
  }

  const modeRaw = String(formData.get("billingSetupMode") ?? "").trim();
  const mode =
    modeRaw === "manual_legacy"
      ? "manual_legacy"
      : isStripeBillingEnabled()
        ? "stripe_subscription"
        : "manual_legacy";
  const setupResult = await enableCustomerBillingLifecycle({
    customerId,
    mode,
    actorUserId: session?.sub ?? null,
  });

  const setupMessages: string[] = [];
  if (setupResult.ok) {
    setupMessages.push(...setupResult.warnings);
  } else {
    setupMessages.push(setupResult.error);
  }
  const warnQuery =
    setupMessages.length > 0
      ? `&warn=${encodeURIComponent(setupMessages.join(" "))}`
      : "";
  redirect(`/admin/customers/${customerId}/billing?setup=1${warnQuery}`);
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
      traqcarePortalUrl: fields.traqcarePortalUrl,
      traqcareClientId: fields.traqcareClientId,
      notes: fields.notes,
      tags: fields.tags,
    };

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
  revalidatePath("/admin/devices");
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

export async function archiveCustomerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    return;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const result = await archiveCustomer(id, session.sub ?? null);
  if (!result.ok) {
    redirect(`/admin/customers/${id}/edit?archiveError=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath(`/admin/customers/${id}/edit`);
  revalidatePath("/admin/devices");
  redirect(`/admin/customers/${id}?archived=1`);
}

export async function unarchiveCustomerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    return;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const result = await unarchiveCustomer(id, session.sub ?? null);
  if (!result.ok) {
    redirect(`/admin/customers/${id}?unarchiveError=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath(`/admin/customers/${id}/edit`);
  redirect(`/admin/customers/${id}?unarchived=1`);
}

export async function syncCustomerToInvoiless(customerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  const result = await syncCustomerToInvoilessBilling(customerId, session?.sub ?? null);
  if (result.ok) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
  }
  return result;
}
