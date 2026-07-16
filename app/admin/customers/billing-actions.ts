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
} from "@/lib/services/billing-paid-pdf-service";
import { sendPaidInvoiceReceiptEmail } from "@/lib/services/billing-paid-receipt-email-service";
import {
  createPendingCustomerSubscription,
  getCurrentCustomerSubscription,
} from "@/lib/services/customer-subscription-service";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import {
  findRecentCheckoutLinkSentAt,
  recordCheckoutLinkSentToCustomer,
} from "@/lib/billing/checkout-link-recent";
import {
  buildStripeCheckoutEmailPreview,
  buildStripeCheckoutAmountLineFromCheckout,
  buildStripeCheckoutWhatsAppPreview,
} from "@/lib/billing/checkout-message-preview";
import {
  checkoutPaymentPlanKey,
  findLatestCheckoutPayLinkTokenForPlan,
  newCheckoutPayLinkToken,
  recordCheckoutPayLinkDestination,
} from "@/lib/stripe/checkout-payment-link";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import {
  buildStripeCheckoutAmountLine,
  sendStripePaymentLinkWhatsApp,
} from "@/lib/billing/customer-whatsapp";
import { recordOutboundWhatsAppMessage } from "@/lib/communications/whatsapp-conversation-service";
import { isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { toSmsAddress, toWhatsAppAddress } from "@/lib/twilio/phone";
import { checkoutInitialEmailBody, checkoutInitialLinkNotice } from "@/lib/stripe/checkout-messaging";
import {
  resendPaymentDeclineEmailForCustomer,
  resendPaymentDeclineWhatsAppForCustomer,
} from "@/lib/stripe/payment-failure-recovery";
import {
  effectiveMonthlyRateForCheckout,
  getDefaultMonthlyRateXcd,
  parseMonthlyRateXcd,
  parseVehicleCount,
} from "@/lib/stripe/checkout-pricing";
import { Prisma, type CustomerBillingMode, type PaymentRemindersPreference } from "@prisma/client";

export type BillingActionState = {
  error: string | null;
  url?: string;
  emailSent?: boolean;
  whatsappSent?: boolean;
  emailError?: string | null;
  whatsappError?: string | null;
  emailTo?: string | null;
  whatsappTo?: string | null;
  emailAttempted?: boolean;
  whatsappAttempted?: boolean;
  message?: string;
};

export type CheckoutSendPreview = {
  customerName: string;
  greetingName: string;
  email: string | null;
  phone: string | null;
  phoneValid: boolean;
  hasRecentLink: boolean;
  recentSentAt: string | null;
  whatsAppConfigured: boolean;
  emailPreviewText: string;
  emailPreviewHtml: string;
  whatsAppPreviewText: string;
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

async function resolveCheckoutPayLinkTokenForPlan(input: {
  customerId: string;
  months: number;
  monthlyRateXcd: number | null;
  vehicleCount: number;
  useCustomPricing: boolean;
}): Promise<{ planKey: string; payLinkToken: string }> {
  const planKey = checkoutPaymentPlanKey({
    durationMonths: input.months,
    vehicleCount: input.vehicleCount,
    monthlyRateXcd: input.monthlyRateXcd,
    useCustomPricing: input.useCustomPricing,
  });
  const existing = await findLatestCheckoutPayLinkTokenForPlan({
    customerId: input.customerId,
    planKey,
  });
  if (existing) return { planKey, payLinkToken: existing.payLinkToken };
  return { planKey, payLinkToken: newCheckoutPayLinkToken() };
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
  revalidatePath(`/admin/customers/${customerId}/messages`);
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

export async function setPaymentRemindersAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  const raw = String(formData.get("paymentReminders") ?? "").trim();
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const preference: PaymentRemindersPreference =
    raw === "on" || raw === "off" || raw === "auto" ? raw : "auto";

  await prisma.customer.update({
    where: { id: customerId },
    data: { paymentReminders: preference },
  });

  await recordOperationalEvent({
    category: "billing.mode_changed",
    customerId,
    actorUserId: session.sub,
    summary: `Payment reminders set to ${preference}`,
    payload: { paymentReminders: preference },
  });

  revalidatePath(`/admin/customers/${customerId}/billing`);
  revalidatePath(`/admin/customers/${customerId}`);
  return { error: null };
}

export async function getStripeCheckoutSendPreview(
  formData: FormData,
): Promise<CheckoutSendPreview | { error: string }> {
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
    select: { company: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (!customer) {
    return { error: "Customer not found." };
  }

  const customerName =
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "Customer";

  const greetingName =
    customer.company?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "there";

  const recent = await findRecentCheckoutLinkSentAt(parsed.customerId);
  const amountLine = buildStripeCheckoutAmountLineFromCheckout({
    monthlyRateXcd: parsed.monthlyRateXcd,
    durationMonths: parsed.months,
    vehicleCount: parsed.vehicleCount,
  });
  const emailPreview = buildStripeCheckoutEmailPreview({
    greetingName,
    durationMonths: parsed.months,
  });

  return {
    customerName,
    greetingName,
    email: customer.email?.trim() || null,
    phone: customer.phone?.trim() || null,
    phoneValid: Boolean(toWhatsAppAddress(customer.phone)),
    hasRecentLink: Boolean(recent),
    recentSentAt: recent ? recent.toISOString() : null,
    whatsAppConfigured: isTwilioWhatsAppConfigured(),
    emailPreviewText: emailPreview.text,
    emailPreviewHtml: emailPreview.html,
    whatsAppPreviewText: buildStripeCheckoutWhatsAppPreview({
      firstName: customer.firstName?.trim() || greetingName,
      amountLine,
      durationMonths: parsed.months,
      isResend: Boolean(recent),
    }),
  };
}

function parseCheckoutSendFlags(formData: FormData): {
  sendEmail: boolean;
  sendWhatsApp: boolean;
  forceResend: boolean;
} {
  return {
    sendEmail: formData.get("sendEmail") === "on" || formData.get("sendEmail") === "true",
    sendWhatsApp: formData.get("sendWhatsApp") === "on" || formData.get("sendWhatsApp") === "true",
    forceResend: formData.get("forceResend") === "on" || formData.get("forceResend") === "true",
  };
}

export async function sendStripeCheckoutToCustomerAction(
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

    const flags = parseCheckoutSendFlags(formData);
    if (!flags.sendEmail && !flags.sendWhatsApp) {
      return { error: "Choose email and/or WhatsApp to send the payment link." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.customerId },
      select: {
        id: true,
        email: true,
        phone: true,
        company: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!customer) {
      return { error: "Customer not found." };
    }

    if (flags.sendEmail && !customer.email?.trim()) {
      return { error: "Customer has no email on file. Add one on the profile, or send WhatsApp only." };
    }
    if (flags.sendWhatsApp && !toWhatsAppAddress(customer.phone)) {
      return {
        error: "Customer has no valid phone for WhatsApp. Add a mobile number on the profile, or send email only.",
      };
    }

    const recent = await findRecentCheckoutLinkSentAt(parsed.customerId);
    if (recent && !flags.forceResend) {
      return {
        error:
          "A payment link was already sent to this customer recently. Confirm resend in the dialog and try again.",
      };
    }

    const saved = await persistStripeMonthlyRateFromForm(parsed.customerId, formData, session.sub);
    if ("error" in saved) {
      return { error: saved.error };
    }

    const { planKey, payLinkToken } = await resolveCheckoutPayLinkTokenForPlan({
      customerId: parsed.customerId,
      months: parsed.months,
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    const stableUrl = `${getAppBaseUrl()}/pay/go/${encodeURIComponent(payLinkToken)}`;

    const checkout = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    if (!checkout.ok) {
      return { error: checkout.error };
    }

    await recordCheckoutPayLinkDestination({
      customerId: parsed.customerId,
      actorUserId: session.sub,
      planKey,
      payLinkToken,
      checkoutSessionId: checkout.sessionId,
      payUrl: checkout.url,
    });

    revalidateCustomerBillingPaths(parsed.customerId);

    const greetingName =
      customer.company?.trim() ||
      [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
      "there";

    const amountLine = buildStripeCheckoutAmountLine({
      monthlyRateXcd: parsed.monthlyRateXcd,
      durationMonths: parsed.months,
      vehicleCount: parsed.vehicleCount,
    });

    const emailAttempted = Boolean(flags.sendEmail && customer.email?.trim());
    const whatsappAttempted = Boolean(flags.sendWhatsApp);
    const emailTo = emailAttempted ? customer.email!.trim() : null;
    const whatsappTo = whatsappAttempted ? toSmsAddress(customer.phone) : null;

    let emailSent = false;
    let whatsappSent = false;
    let emailError: string | null = null;
    let whatsappError: string | null = null;
    let whatsappMessageSid: string | null = null;
    const partialErrors: string[] = [];

    if (emailAttempted && emailTo) {
      const emailBody = checkoutInitialEmailBody({
        greetingName,
        paymentUrl: stableUrl,
        durationMonths: parsed.months,
      });
      const sent = await sendAppEmail({
        to: emailTo,
        subject: "Complete your Track Lucia subscription payment",
        text: emailBody.text,
        html: emailBody.html,
      });
      if (sent.ok) {
        emailSent = true;
        await recordOperationalEvent({
          category: "communication.message_sent",
          customerId: parsed.customerId,
          actorUserId: session.sub,
          summary: `Checkout payment link emailed to ${emailTo}`,
          payload: {
            channel: "email",
            kind: "stripe_checkout",
            to: emailTo,
            checkoutSessionId: checkout.sessionId,
            paymentUrl: stableUrl,
          },
        });
      } else {
        emailError = sent.error;
        partialErrors.push(`Email: ${sent.error}`);
      }
    }

    if (whatsappAttempted) {
      const wa = await sendStripePaymentLinkWhatsApp({
        customer,
        paymentUrl: stableUrl,
        checkoutSessionId: checkout.sessionId,
        amountLine,
        durationMonths: parsed.months,
        isResend: Boolean(recent),
      });
      if (wa.ok) {
        whatsappSent = true;
        whatsappMessageSid = wa.messageSid;
        const templateKind = recent ? "stripe_payment_link_resend" : "stripe_payment_link";
        if (whatsappTo) {
          await recordOutboundWhatsAppMessage({
            phoneE164: whatsappTo,
            body: `[template:${templateKind}] ${amountLine} · ${stableUrl}`,
            messageSid: wa.messageSid,
            actorUserId: session.sub,
            kind: "template",
          });
        }
        await recordOperationalEvent({
          category: "communication.message_sent",
          customerId: parsed.customerId,
          actorUserId: session.sub,
          summary: `Checkout payment link WhatsApp sent to ${customer.phone ?? whatsappTo ?? "customer"}`,
          payload: {
            channel: "whatsapp",
            kind: "stripe_checkout",
            to: customer.phone ?? whatsappTo,
            templateKind,
            messageSid: wa.messageSid,
            checkoutSessionId: checkout.sessionId,
            paymentUrl: stableUrl,
            amountLine,
          },
        });
      } else {
        whatsappError = wa.error;
        partialErrors.push(`WhatsApp: ${wa.error}`);
      }
    }

    if (emailSent || whatsappSent) {
      await recordCheckoutLinkSentToCustomer({
        customerId: parsed.customerId,
        actorUserId: session.sub,
        checkoutSessionId: checkout.sessionId,
        channels: { email: emailSent, whatsapp: whatsappSent },
        paymentUrl: stableUrl,
        emailTo,
        whatsappTo: customer.phone ?? whatsappTo,
        emailError,
        whatsappError,
        whatsappMessageSid,
      });
    }

    const channelResult = {
      emailAttempted,
      whatsappAttempted,
      emailSent,
      whatsappSent,
      emailError,
      whatsappError,
      emailTo,
      whatsappTo: customer.phone ?? whatsappTo,
    };

    if (!emailSent && !whatsappSent) {
      return {
        error: partialErrors.join(" ") || "Could not send payment link.",
        url: stableUrl,
        ...channelResult,
      };
    }

    const channelParts: string[] = [];
    if (emailSent) channelParts.push("email");
    if (whatsappSent) channelParts.push("WhatsApp");

    const pricingNote =
      checkout.pricingMode === "catalog"
        ? "Using Stripe catalog price × vehicle count."
        : "Using dynamic pricing.";

    return {
      error: partialErrors.length > 0 ? partialErrors.join(" ") : null,
      url: stableUrl,
      ...channelResult,
      message: `Payment link sent via ${channelParts.join(" and ")}. ${checkoutInitialLinkNotice()} ${pricingNote}`,
    };
  } catch (e) {
    console.error("sendStripeCheckoutToCustomerAction", e);
    return {
      error: e instanceof Error ? e.message : "Could not send payment link. Try again.",
    };
  }
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

    const { planKey, payLinkToken } = await resolveCheckoutPayLinkTokenForPlan({
      customerId: parsed.customerId,
      months: parsed.months,
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });

    const result = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    if (!result.ok) {
      return { error: result.error };
    }

    await recordCheckoutPayLinkDestination({
      customerId: parsed.customerId,
      actorUserId: session.sub,
      planKey,
      payLinkToken,
      checkoutSessionId: result.sessionId,
      payUrl: result.url,
    });

    revalidateCustomerBillingPaths(parsed.customerId);

    const pricingNote =
      result.pricingMode === "catalog"
        ? "Using Stripe catalog price × vehicle count."
        : "Using dynamic pricing (custom or missing catalog Price).";

    const stableUrl = `${getAppBaseUrl()}/pay/go/${encodeURIComponent(payLinkToken)}`;
    return {
      error: null,
      url: stableUrl,
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

    const { planKey, payLinkToken } = await resolveCheckoutPayLinkTokenForPlan({
      customerId: parsed.customerId,
      months: parsed.months,
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    const stableUrl = `${getAppBaseUrl()}/pay/go/${encodeURIComponent(payLinkToken)}`;

    const checkout = await startStripeCheckout(parsed.customerId, parsed.months, session.sub, {
      monthlyRateXcd: parsed.monthlyRateXcd,
      vehicleCount: parsed.vehicleCount,
      useCustomPricing: parsed.useCustomPricing,
    });
    if (!checkout.ok) {
      return { error: checkout.error };
    }

    await recordCheckoutPayLinkDestination({
      customerId: parsed.customerId,
      actorUserId: session.sub,
      planKey,
      payLinkToken,
      checkoutSessionId: checkout.sessionId,
      payUrl: checkout.url,
    });

    revalidateCustomerBillingPaths(parsed.customerId);

    const name =
      customer.company?.trim() ||
      [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
      "there";

    const emailBody = checkoutInitialEmailBody({
      greetingName: name,
      paymentUrl: stableUrl,
      durationMonths: parsed.months,
    });

    const sent = await sendAppEmail({
      to: customer.email.trim(),
      subject: "Complete your Track Lucia subscription payment",
      text: emailBody.text,
      html: emailBody.html,
    });

    if (!sent.ok) {
      return { error: sent.error, url: stableUrl };
    }

    return {
      error: null,
      url: stableUrl,
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

  const months = Number(String(formData.get("durationMonths") ?? ""));
  if (![1, 3, 6, 12].includes(months)) {
    return { error: "Choose a valid plan term (1, 3, 6, or 12 months)." };
  }
  const vehicleCount = parseVehicleCount(String(formData.get("vehicleCount") ?? "")) ?? 1;

  try {
    const saved = await persistStripeMonthlyRateFromForm(customerId, formData, session.sub);
    if ("error" in saved) {
      return { error: saved.error };
    }

    const rateRaw = String(formData.get("monthlyRateXcd") ?? "").trim();
    const defaultMonthly = await getDefaultMonthlyRateXcd();
    let customMonthly: number | null = null;
    if (rateRaw === "custom") {
      customMonthly = parseMonthlyRateXcd(String(formData.get("customMonthlyRateXcd") ?? ""));
    }
    const { monthlyRateXcd } = effectiveMonthlyRateForCheckout(rateRaw, customMonthly, defaultMonthly);

    const current = await getCurrentCustomerSubscription(customerId);
    const canWritePending =
      !current ||
      current.status === "canceled" ||
      (current.status === "pending_payment" && !current.stripeSubscriptionId);

    if (canWritePending) {
      if (current?.status === "pending_payment" && !current.stripeSubscriptionId) {
        await prisma.customerSubscription.update({
          where: { id: current.id },
          data: {
            planTermMonths: months,
            monthlyRateXcd:
              monthlyRateXcd != null && monthlyRateXcd > 0
                ? new Prisma.Decimal(monthlyRateXcd)
                : null,
            vehicleCount,
          },
        });
      } else {
        await createPendingCustomerSubscription({
          customerId,
          planTermMonths: months,
          monthlyRateXcd,
          vehicleCount,
        });
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save pricing." };
  }

  revalidateCustomerBillingPaths(customerId);
  return { error: null, message: "Pricing saved." };
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

/** Push TL active-assignment vehicle count to Stripe subscription quantity (no proration). */
export async function pushStripeSubscriptionQuantityAction(
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

  const { pushTlVehicleCountToStripe } = await import(
    "@/lib/services/stripe-subscription-sync-service"
  );
  const result = await pushTlVehicleCountToStripe({
    customerId,
    actorUserId: session.sub,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCustomerBillingPaths(customerId);
  return {
    error: null,
    message: `Stripe quantity updated ${result.previousQuantity} → ${result.newQuantity}. Applies on the next invoice (no charge today).`,
  };
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

  const row = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    select: { customerId: true },
  });
  if (!row || row.customerId !== customerId) {
    return { error: "Invoice not found." };
  }

  const sent = await sendPaidInvoiceReceiptEmail(billingInvoiceId, {
    source: "manual",
    force: true,
    actorUserId: session.sub,
  });
  if (!sent.ok) {
    return { error: sent.error };
  }
  if ("skipped" in sent && sent.skipped) {
    return { error: sent.reason };
  }
  if (!("sentTo" in sent)) {
    return { error: "Could not send receipt email." };
  }

  revalidatePath(`/admin/customers/${customerId}/billing`);
  return { error: null, message: `Receipt emailed to ${sent.sentTo}.` };
}

export type ResendPaymentDeclineEmailState = {
  error: string | null;
  ok?: boolean;
  message?: string;
};

export async function resendPaymentDeclineEmailAction(
  _prev: ResendPaymentDeclineEmailState,
  formData: FormData,
): Promise<ResendPaymentDeclineEmailState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const result = await resendPaymentDeclineEmailForCustomer(customerId, session.sub);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/admin/customers/${customerId}/billing`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin");
  return {
    error: null,
    ok: true,
    message: `Decline follow-up email sent to ${result.email}.`,
  };
}

export type ResendPaymentDeclineWhatsAppState = {
  error: string | null;
  ok?: boolean;
  message?: string;
};

export async function resendPaymentDeclineWhatsAppAction(
  _prev: ResendPaymentDeclineWhatsAppState,
  formData: FormData,
): Promise<ResendPaymentDeclineWhatsAppState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) {
    return { error: "Missing customer id." };
  }

  const result = await resendPaymentDeclineWhatsAppForCustomer(customerId, session.sub);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/admin/customers/${customerId}/billing`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin");
  return {
    error: null,
    ok: true,
    message: `Decline follow-up WhatsApp sent${result.phone ? ` to ${result.phone}` : ""}.`,
  };
}
