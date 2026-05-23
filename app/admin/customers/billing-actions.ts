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
import { enableCustomerBillingLifecycle } from "@/lib/services/billing-lifecycle-service";
import {
  generateAndStorePaidInvoicePdf,
  loadBillingInvoicePdfBytes,
} from "@/lib/services/billing-paid-pdf-service";
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

async function persistStripeMonthlyRateFromForm(
  customerId: string,
  formData: FormData,
  actorUserId: string | null,
): Promise<{ error: string } | { ok: true }> {
  try {
    const rateRaw = String(formData.get("monthlyRateXcd") ?? "").trim();
    if (rateRaw === "custom") {
      const customMonthly = parseMonthlyRateXcd(String(formData.get("customMonthlyRateXcd") ?? ""));
      if (customMonthly == null) {
        return { error: "Enter a valid custom monthly amount." };
      }
      await setCustomerStripeMonthlyRate(customerId, customMonthly, actorUserId);
      return { ok: true };
    }
    if (rateRaw === "default" || !rateRaw) {
      await setCustomerStripeMonthlyRate(customerId, null, actorUserId);
      return { ok: true };
    }
    const parsed = parseMonthlyRateXcd(rateRaw);
    if (parsed == null) {
      return { error: "Choose a valid monthly rate tier." };
    }
    await setCustomerStripeMonthlyRate(customerId, parsed, actorUserId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save monthly rate." };
  }
}

async function assertCustomerReadyForStripeCheckout(
  customerId: string,
): Promise<{ error: string } | { ok: true }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true },
  });
  if (!customer?.email?.trim()) {
    return {
      error:
        "Customer has no email on file. Add one under Edit profile, then create the payment link.",
    };
  }
  return { ok: true };
}

function revalidateCustomerBillingPaths(customerId: string) {
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/billing`);
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
  try {
    const session = await getSession();
    if (!session) {
      return { error: "You must be signed in." };
    }

    const parsed = await parseCheckoutForm(formData);
    if ("error" in parsed) {
      return { error: parsed.error };
    }

    const ready = await assertCustomerReadyForStripeCheckout(parsed.customerId);
    if ("error" in ready) {
      return { error: ready.error };
    }

    const saved = await persistStripeMonthlyRateFromForm(parsed.customerId, formData, session.sub);
    if ("error" in saved) {
      return { error: saved.error };
    }

    const result = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    if (!result.ok) {
      return { error: result.error };
    }

    revalidateCustomerBillingPaths(parsed.customerId);

    const pricingNote =
      result.pricingMode === "catalog"
        ? "Using Stripe catalog price × vehicle count."
        : "Using dynamic pricing (custom or missing catalog Price).";

    return {
      error: null,
      url: result.url,
      message: `Copy the link below and send it to your customer. ${checkoutInitialLinkNotice()} ${pricingNote}`,
    };
  } catch (e) {
    console.error("startStripeCheckoutAction", e);
    return {
      error: e instanceof Error ? e.message : "Could not create payment link. Try again.",
    };
  }
}

export async function emailStripeCheckoutLinkAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
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

    const saved = await persistStripeMonthlyRateFromForm(parsed.customerId, formData, session.sub);
    if ("error" in saved) {
      return { error: saved.error };
    }

    const checkout = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    if (!checkout.ok) {
      return { error: checkout.error };
    }

    revalidateCustomerBillingPaths(parsed.customerId);

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
  } catch (e) {
    console.error("emailStripeCheckoutLinkAction", e);
    return {
      error: e instanceof Error ? e.message : "Could not email payment link. Try again.",
    };
  }
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

  try {
    const saved = await persistStripeMonthlyRateFromForm(customerId, formData, session.sub);
    if ("error" in saved) {
      return { error: saved.error };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save monthly rate." };
  }

  revalidateCustomerBillingPaths(customerId);
  return { error: null, message: "Monthly rate saved." };
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
    revalidatePath(`/admin/customers/${customerId}/billing`);
    revalidatePath("/admin/customers");
  }
  return result;
}

export async function enableBillingSetupAction(
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

  const modeRaw = String(formData.get("billingMode") ?? "").trim();
  const mode =
    modeRaw === "manual_legacy" ? "manual_legacy" : ("stripe_subscription" as const);

  const result = await enableCustomerBillingLifecycle({
    customerId,
    mode,
    actorUserId: session.sub,
  });

  revalidatePath(`/admin/customers/${customerId}/billing`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath("/admin/customers");

  if (!result.ok) {
    return { error: result.error };
  }

  const warn =
    result.warnings.length > 0 ? ` Note: ${result.warnings.join(" ")}` : "";
  return {
    error: null,
    message: `Billing accounts linked (${mode.replace(/_/g, " ")}).${warn} Send a payment link when ready — checkout is not started automatically.`,
  };
}

export type BillingInvoiceActionState = {
  error: string | null;
  message?: string;
};

export async function regenerateBillingInvoicePdfAction(
  _prev: BillingInvoiceActionState,
  formData: FormData,
): Promise<BillingInvoiceActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const billingInvoiceId = String(formData.get("billingInvoiceId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!billingInvoiceId || !customerId) {
    return { error: "Missing invoice or customer." };
  }

  const result = await generateAndStorePaidInvoicePdf(billingInvoiceId, { force: true });
  revalidatePath(`/admin/customers/${customerId}/billing`);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    error: null,
    message: result.skipped
      ? "PDF already stored."
      : `PDF generated (${result.displayNumber}).`,
  };
}

export async function emailBillingInvoicePdfAction(
  _prev: BillingInvoiceActionState,
  formData: FormData,
): Promise<BillingInvoiceActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const billingInvoiceId = String(formData.get("billingInvoiceId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!billingInvoiceId || !customerId) {
    return { error: "Missing invoice or customer." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, company: true, firstName: true, lastName: true },
  });
  const to = customer?.email?.trim();
  if (!to) {
    return { error: "Customer has no email address." };
  }

  let row = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    select: { displayNumber: true, pdfStoragePath: true, status: true, customerId: true },
  });
  if (!row || row.customerId !== customerId) {
    return { error: "Invoice not found." };
  }
  if (row.status.toLowerCase() !== "paid") {
    return { error: "Only paid invoices can be emailed." };
  }

  if (!row.pdfStoragePath) {
    const gen = await generateAndStorePaidInvoicePdf(billingInvoiceId);
    if (!gen.ok) {
      return { error: gen.error };
    }
    row = await prisma.billingInvoice.findUnique({
      where: { id: billingInvoiceId },
      select: { displayNumber: true, pdfStoragePath: true, status: true, customerId: true },
    });
  }

  if (!row?.pdfStoragePath) {
    return { error: "PDF is not available." };
  }

  const pdfBytes = await loadBillingInvoicePdfBytes(row.pdfStoragePath);
  if (!pdfBytes) {
    return { error: "Could not load PDF from storage." };
  }

  const displayNumber = row.displayNumber ?? "invoice";
  const greeting =
    customer?.company?.trim() ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() ||
    "there";

  const transportOpts = await import("@/lib/email/smtp-settings").then((m) => m.getSmtpTransportOptions());
  const from = await import("@/lib/email/smtp-settings").then((m) => m.getSmtpMailFrom());
  if (!transportOpts || !from) {
    return { error: "SMTP is not configured in Admin → Settings." };
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport(transportOpts);
  const filename = `${displayNumber.replace(/[^\w-]+/g, "-")}.pdf`;

  try {
    await transporter.sendMail({
      from: from.name ? `"${from.name}" <${from.address}>` : from.address,
      to,
      subject: `Receipt ${displayNumber} — Track Lucia`,
      text: `Hi ${greeting},\n\nPlease find your paid invoice receipt attached (${displayNumber}).\n\nThank you,\nTrack Lucia`,
      html: `<p>Hi ${greeting},</p><p>Please find your paid invoice receipt attached (<strong>${displayNumber}</strong>).</p><p>Thank you,<br>Track Lucia</p>`,
      attachments: [
        {
          filename,
          content: pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send email." };
  }

  revalidatePath(`/admin/customers/${customerId}/billing`);
  return { error: null, message: `Receipt emailed to ${to}.` };
}
