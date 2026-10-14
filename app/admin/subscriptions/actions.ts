"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { createRecurringSchedule } from "@/lib/services/native-recurring-schedule-service";
import { startStripeCheckout } from "@/lib/services/billing-service";
import { openStripeBillingPortal } from "@/lib/services/billing-service";
import { getDefaultMonthlyRateXcd, parseMonthlyRateXcd, parseVehicleCount, periodTotalPerVehicleXcd } from "@/lib/stripe/checkout-pricing";
import { setRecurringScheduleStatus } from "@/lib/services/native-recurring-schedule-service";

export type CreateSubscriptionState = {
  error?: string;
  ok?: boolean;
  url?: string;
  message?: string;
};

export type SubscriptionLifecycleState = { error?: string; ok?: boolean; message?: string; url?: string };

export async function setManualSubscriptionStatusAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("You must be signed in.");
  const scheduleId = text(formData, "scheduleId");
  const status = text(formData, "status");
  if (!scheduleId || !["active", "paused", "ended"].includes(status)) throw new Error("Invalid subscription action.");
  await setRecurringScheduleStatus(scheduleId, status as "active" | "paused" | "ended");
  revalidatePath("/admin/subscriptions");
  revalidatePath(`/admin/recurring-invoices/${scheduleId}`);
}

export async function openSubscriptionBillingPortalAction(customerId: string): Promise<SubscriptionLifecycleState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };
  const result = await openStripeBillingPortal(customerId.trim());
  return result.ok ? { ok: true, url: result.url } : { error: result.error };
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function createSubscriptionAction(
  _previous: CreateSubscriptionState,
  formData: FormData,
): Promise<CreateSubscriptionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const customerId = text(formData, "customerId");
  const collectionMethod = text(formData, "collectionMethod");
  const months = Number(text(formData, "durationMonths"));
  const vehicleCount = parseVehicleCount(text(formData, "vehicleCount")) ?? 1;
  const rateRaw = text(formData, "monthlyRateXcd");
  const customRate = parseMonthlyRateXcd(rateRaw);
  const monthlyRateXcd = rateRaw === "default" || !rateRaw ? null : customRate;

  if (!customerId) return { error: "Choose a customer." };
  if (![1, 3, 6, 12].includes(months)) return { error: "Choose a valid term." };
  if (rateRaw && rateRaw !== "default" && customRate == null) return { error: "Enter a valid monthly rate." };
  if (collectionMethod !== "card" && collectionMethod !== "manual") return { error: "Choose a collection method." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, email: true, company: true, firstName: true, lastName: true },
  });
  if (!customer) return { error: "Customer not found." };

  try {
    if (collectionMethod === "card") {
      if (!customer.email?.trim()) return { error: "Card subscriptions require a customer email." };
      const defaultRate = await getDefaultMonthlyRateXcd();
      const checkout = await startStripeCheckout(customerId, months, session.sub, {
        monthlyRateXcd,
        vehicleCount,
        useCustomPricing: monthlyRateXcd != null && monthlyRateXcd !== defaultRate,
      });
      if (!checkout.ok) return { error: checkout.error };
      revalidatePath("/admin/subscriptions");
      revalidatePath(`/admin/customers/${customerId}/billing`);
      return { ok: true, url: checkout.url, message: "Checkout link created. Send it to the customer to activate the subscription." };
    }

    const name = customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Customer";
    const scheduleId = await createRecurringSchedule({
      name: `${name} subscription`,
      customerId,
      currency: "XCD",
      intervalMonths: months,
      nextIssueDate: new Date(),
      dueDaysAfterIssue: Number(text(formData, "dueDays")) || 30,
      autoEmail: formData.get("autoEmail") === "on",
      emailTo: customer.email?.trim() || null,
      paymentInstructions: text(formData, "paymentInstructions") || null,
      createdById: session.sub,
      lineItems: [{ description: `${months}-month subscription`, quantity: vehicleCount, unitPrice: periodTotalPerVehicleXcd(monthlyRateXcd ?? await getDefaultMonthlyRateXcd(), months) }],
    });
    await prisma.customer.update({ where: { id: customerId }, data: { billingMode: "manual_legacy" } });
    revalidatePath("/admin/subscriptions");
    revalidatePath("/admin/recurring-invoices");
    revalidatePath(`/admin/customers/${customerId}/billing`);
    return { ok: true, url: `/admin/recurring-invoices/${scheduleId}`, message: "Manual subscription created. Its first invoice is scheduled for today." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create subscription." };
  }
}
