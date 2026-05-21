"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { sendAppEmail } from "@/lib/email/send-mail";
import {
  openStripeBillingPortal,
  setCustomerBillingMode,
  setCustomerStripeMonthlyRate,
  startStripeCheckout,
  syncCustomerToInvoilessBilling,
} from "@/lib/services/billing-service";
import { checkoutInitialEmailBody, checkoutInitialLinkNotice } from "@/lib/stripe/checkout-messaging";
import {
  effectiveMonthlyRateForCheckout,
  getDefaultMonthlyRateXcd,
  parseMonthlyRateXcd,
  parseVehicleCount,
} from "@/lib/stripe/checkout-pricing";
import type { CustomerBillingMode } from "@prisma/client";

export type BillingActionState = {
  error: string | null;
  url?: string;
  emailSent?: boolean;
  message?: string;
};

async function parseCheckoutForm(formData: FormData): Promise<
  | {
      customerId: string;
      months: number;
      monthlyRateXcd: number | null;
      vehicleCount: number;
      useCustomPricing: boolean;
    }
  | { error: string }
> {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const months = Number(String(formData.get("durationMonths") ?? ""));
  if (!customerId) {
    return { error: "Missing customer id." };
  }
  if (![1, 3, 6, 12].includes(months)) {
    return { error: "Choose a valid plan term (1, 3, 6, or 12 months)." };
  }

  const vehicleCount = parseVehicleCount(String(formData.get("vehicleCount") ?? "")) ?? 1;

  const rateRaw = String(formData.get("monthlyRateXcd") ?? "").trim();
  const defaultMonthly = await getDefaultMonthlyRateXcd();
  let customMonthly: number | null = null;
  if (rateRaw === "custom") {
    customMonthly = parseMonthlyRateXcd(String(formData.get("customMonthlyRateXcd") ?? ""));
    if (customMonthly == null) {
      return { error: "Enter a valid custom monthly amount for Checkout." };
    }
  }

  const { monthlyRateXcd, useCustomPricing } = effectiveMonthlyRateForCheckout(
    rateRaw,
    customMonthly,
    defaultMonthly,
  );

  if (rateRaw && rateRaw !== "default" && rateRaw !== "custom") {
    const parsed = parseMonthlyRateXcd(rateRaw);
    if (parsed == null) {
      return { error: "Choose a valid monthly rate tier for Checkout." };
    }
  }

  return { customerId, months, monthlyRateXcd, vehicleCount, useCustomPricing };
}

export async function setBillingModeAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const modeRaw = String(formData.get("billingMode") ?? "").trim();
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const mode: CustomerBillingMode =
    modeRaw === "stripe_subscription" ? "stripe_subscription" : "manual_legacy";

  try {
    await setCustomerBillingMode(customerId, mode, session.sub);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update billing mode." };
  }

  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { error: null };
}

export async function startStripeCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const parsed = await parseCheckoutForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const result = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
    monthlyRateXcd: parsed.monthlyRateXcd,
    vehicleCount: parsed.vehicleCount,
    useCustomPricing: parsed.useCustomPricing,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  const pricingNote =
    result.pricingMode === "catalog"
      ? "Using Stripe catalog price × vehicle count."
      : "Using dynamic pricing (custom or missing catalog Price).";

  return {
    error: null,
    url: result.url,
    message: `Copy the link below and send it to your customer. ${checkoutInitialLinkNotice()} ${pricingNote}`,
  };
}

export async function emailStripeCheckoutLinkAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const parsed = await parseCheckoutForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.customerId },
    select: { email: true, company: true, firstName: true, lastName: true },
  });
  if (!customer?.email?.trim()) {
    return { error: "Customer has no email on file. Add one on the profile below, then try again." };
  }

  const checkout = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
    monthlyRateXcd: parsed.monthlyRateXcd,
    vehicleCount: parsed.vehicleCount,
    useCustomPricing: parsed.useCustomPricing,
  });
  if (!checkout.ok) {
    return { error: checkout.error };
  }

  const name =
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "there";

  const emailBody = checkoutInitialEmailBody({
    greetingName: name,
    paymentUrl: checkout.url,
  });

  const sent = await sendAppEmail({
    to: customer.email.trim(),
    subject: "Complete your Track Lucia subscription payment",
    text: emailBody.text,
    html: emailBody.html,
  });

  if (!sent.ok) {
    return { error: sent.error, url: checkout.url };
  }

  return {
    error: null,
    url: checkout.url,
    emailSent: true,
    message: `Payment link emailed to ${customer.email.trim()}. ${checkoutInitialLinkNotice()} You can also copy the link below.`,
  };
}

export async function setStripeMonthlyRateAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const rate = parseMonthlyRateXcd(String(formData.get("monthlyRateXcd") ?? ""));
  const customRaw = String(formData.get("customMonthlyRateXcd") ?? "").trim();
  let monthly: number | null = rate;
  if (customRaw) {
    const custom = parseMonthlyRateXcd(customRaw);
    if (custom == null) {
      return { error: "Enter a valid custom monthly amount (e.g. 20 or 25)." };
    }
    monthly = custom;
  }

  try {
    await setCustomerStripeMonthlyRate(customerId, monthly, session.sub);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save monthly rate." };
  }

  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/billing`);
  return { error: null };
}

export async function openStripePortalAction(customerId: string): Promise<BillingActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = customerId.trim();
  if (!id) {
    return { error: "Missing customer id." };
  }

  const result = await openStripeBillingPortal(id);
  if (!result.ok) {
    return { error: result.error };
  }

  return { error: null, url: result.url };
}

export async function syncInvoilessBillingAction(customerId: string) {
  const session = await getSession();
  const result = await syncCustomerToInvoilessBilling(customerId, session?.sub ?? null);
  if (result.ok) {
    revalidatePath(`/admin/customers/${customerId}/edit`);
    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/admin/customers");
  }
  return result;
}
