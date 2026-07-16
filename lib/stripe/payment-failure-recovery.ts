import "server-only";

import { randomBytes } from "crypto";

import type Stripe from "stripe";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { getBillingAlertSmsRecipients } from "@/lib/billing/billing-alert-phones";
import { sendPaymentDeclineWhatsApp } from "@/lib/billing/customer-whatsapp";
import { formatMoney } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";
import { sendAppEmail } from "@/lib/email/send-mail";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { sendTwilioAdminSms } from "@/lib/twilio/admin-sms";
import { isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { toWhatsAppAddress } from "@/lib/twilio/phone";

import { getAppBaseUrl } from "./app-url";
import { getStripeClient } from "./config";
import {
  customerFacingDeclinePaymentLabel,
  declineCodeGuidance,
  declineCodeShortReason,
  paymentFailureEmailBody,
  type PaymentFailureDeclineKind,
} from "./payment-failure-messaging";
import { resolveTlCustomerIdFromStripeInvoice } from "./invoice-sync";

const RECENT_FAILURE_HOURS = 48;

/** Short, URL-safe token for the `/pay/go/{token}` decline button. */
function newPayLinkToken(): string {
  return randomBytes(9).toString("base64url");
}

/** Resolve a `/pay/go/{token}` decline token to its real pay destination. */
export async function resolvePayLinkTokenDestination(token: string): Promise<string | null> {
  const clean = token.trim();
  if (!clean) return null;
  const event = await prisma.operationalEvent.findFirst({
    where: {
      category: { in: ["billing.payment_failed", "billing.checkout_payment_link"] },
      payload: { path: ["payLinkToken"], equals: clean },
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });
  const payUrl = (event?.payload as { payUrl?: string | null } | null)?.payUrl ?? null;
  if (!payUrl || payUrl.includes("/admin/")) return null;
  return payUrl;
}

export type ResolvedPaymentFailure = {
  paymentIntentId: string;
  customerId: string | null;
  kind: "native_invoice" | "subscription" | "unknown";
  tlInvoiceId: string | null;
  publicToken: string | null;
  invoiceNumber: string | null;
  stripeInvoiceId: string | null;
  amount: number;
  currency: string;
  last4: string | null;
  declineCode: string | null;
  payUrl: string | null;
};

async function hasPaymentFailureRecoveryBeenSent(paymentIntentId: string): Promise<boolean> {
  const row = await prisma.operationalEvent.findFirst({
    where: {
      category: "billing.payment_failed",
      payload: {
        path: ["paymentIntentId"],
        equals: paymentIntentId,
      },
    },
    select: { id: true },
  });
  return row != null;
}

function extractLast4(paymentIntent: Stripe.PaymentIntent): string | null {
  const fromError = paymentIntent.last_payment_error?.payment_method as
    | { card?: { last4?: string } }
    | undefined;
  if (fromError?.card?.last4) return fromError.card.last4;

  const pm = paymentIntent.payment_method;
  if (pm && typeof pm !== "string" && pm.card?.last4) {
    return pm.card.last4;
  }

  const charge = paymentIntent.latest_charge;
  if (charge && typeof charge !== "string") {
    const card = charge.payment_method_details?.card;
    if (card?.last4) return card.last4;
  }

  return null;
}

async function resolveNativeInvoicePayUrl(
  tlInvoiceId: string,
  publicTokenFromMeta: string | null,
): Promise<{ payUrl: string | null; publicToken: string | null; invoiceNumber: string | null }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: tlInvoiceId },
    select: { publicToken: true, number: true },
  });
  if (!invoice) {
    return { payUrl: null, publicToken: publicTokenFromMeta, invoiceNumber: null };
  }
  const token = invoice.publicToken ?? publicTokenFromMeta;
  const payUrl = token ? `${getAppBaseUrl()}/pay/i/${encodeURIComponent(token)}` : null;
  return { payUrl, publicToken: token, invoiceNumber: invoice.number };
}

export async function resolvePaymentFailure(
  paymentIntent: Stripe.PaymentIntent,
  stripeInvoice?: Stripe.Invoice | null,
): Promise<ResolvedPaymentFailure | null> {
  if (paymentIntent.status === "succeeded") return null;

  const meta = paymentIntent.metadata ?? {};
  const checkoutKind = meta.tl_checkout_kind?.trim();
  const tlInvoiceId = meta.tl_invoice_id?.trim() || null;
  const publicTokenMeta = meta.tl_public_token?.trim() || null;
  let customerId = meta.tl_customer_id?.trim() || null;
  let kind: ResolvedPaymentFailure["kind"] = "unknown";
  let payUrl: string | null = null;
  let publicToken = publicTokenMeta;
  let invoiceNumber: string | null = null;
  let stripeInvoiceId = stripeInvoice?.id ?? null;

  const amount = (paymentIntent.amount ?? 0) / 100;
  const currency = (paymentIntent.currency ?? "xcd").toUpperCase();
  const declineCode = paymentIntent.last_payment_error?.decline_code ?? null;
  const last4 = extractLast4(paymentIntent);

  if (checkoutKind === "native_invoice" && tlInvoiceId) {
    kind = "native_invoice";
    const resolved = await resolveNativeInvoicePayUrl(tlInvoiceId, publicTokenMeta);
    payUrl = resolved.payUrl;
    publicToken = resolved.publicToken;
    invoiceNumber = resolved.invoiceNumber;
    if (!customerId) {
      const inv = await prisma.invoice.findUnique({
        where: { id: tlInvoiceId },
        select: { customerId: true },
      });
      customerId = inv?.customerId ?? null;
    }
  } else if (stripeInvoice) {
    kind = "subscription";
    stripeInvoiceId = stripeInvoice.id;
    invoiceNumber = stripeInvoice.number ?? null;
    payUrl = stripeInvoice.hosted_invoice_url ?? null;
    if (!customerId) {
      customerId = await resolveTlCustomerIdFromStripeInvoice(stripeInvoice);
    }
  } else if (customerId) {
    payUrl = `${getAppBaseUrl()}/admin/customers/${customerId}/billing`;
    kind = "unknown";
  }

  if (!paymentIntent.id) return null;

  return {
    paymentIntentId: paymentIntent.id,
    customerId,
    kind,
    tlInvoiceId,
    publicToken,
    invoiceNumber,
    stripeInvoiceId,
    amount,
    currency,
    last4,
    declineCode,
    payUrl,
  };
}

export async function loadPaymentIntentForFailure(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge", "payment_method"],
  });
}

/**
 * Email customer + SMS staff on a declined payment. Idempotent per PaymentIntent id.
 */
export async function handleStripePaymentFailure(input: {
  paymentIntent: Stripe.PaymentIntent;
  stripeInvoice?: Stripe.Invoice | null;
}): Promise<void> {
  let paymentIntent = input.paymentIntent;
  if (
    paymentIntent.last_payment_error == null ||
    (typeof paymentIntent.payment_method === "string" && paymentIntent.latest_charge == null)
  ) {
    paymentIntent = await loadPaymentIntentForFailure(paymentIntent.id);
  }

  if (await hasPaymentFailureRecoveryBeenSent(paymentIntent.id)) {
    return;
  }

  const failure = await resolvePaymentFailure(paymentIntent, input.stripeInvoice ?? null);
  if (!failure) return;

  const amountLabel = formatMoney(failure.amount, failure.currency);
  const payLinkToken = newPayLinkToken();
  let emailSent = false;
  let emailError: string | null = null;
  let whatsAppSent = false;
  let whatsAppError: string | null = null;
  let smsRecipientCount = 0;
  const smsErrors: string[] = [];

  const canNotifyCustomer = Boolean(
    failure.customerId && failure.payUrl && !failure.payUrl.includes("/admin/"),
  );

  if (canNotifyCustomer) {
    const customer = await prisma.customer.findUnique({
      where: { id: failure.customerId! },
      select: { email: true, company: true, firstName: true, lastName: true, phone: true, id: true },
    });

    // Email
    const email = customer?.email?.trim();
    if (customer && email) {
      const body = paymentFailureEmailBody({
        greetingName: customerDisplayName(customer),
        amountLabel,
        kind: failure.kind,
        invoiceNumber: failure.invoiceNumber,
        payUrl: failure.payUrl!,
        declineCode: failure.declineCode,
      });
      const sent = await sendAppEmail({
        to: email,
        subject: body.subject,
        text: body.text,
        html: body.html,
      });
      if (sent.ok) {
        emailSent = true;
      } else {
        emailError = sent.error;
      }
    } else {
      emailError = "Customer has no email on file.";
    }

    // WhatsApp (independent of email)
    if (!customer) {
      whatsAppError = "Customer could not be resolved.";
    } else if (!isTwilioWhatsAppConfigured()) {
      whatsAppError = "Twilio WhatsApp is not configured.";
    } else if (!toWhatsAppAddress(customer.phone)) {
      whatsAppError = "Customer has no valid phone for WhatsApp.";
    } else {
      const { bodyLabel } = customerFacingDeclinePaymentLabel({
        kind: failure.kind,
        invoiceNumber: failure.invoiceNumber,
      });
      const waResult = await sendPaymentDeclineWhatsApp({
        customer,
        reasonPhrase: declineCodeShortReason(failure.declineCode),
        paymentLabel: bodyLabel,
        amountLabel,
        payLinkToken,
        externalRef: failure.paymentIntentId,
      });
      if (waResult.ok) {
        whatsAppSent = true;
      } else {
        whatsAppError = waResult.error;
      }
    }
  } else if (!failure.payUrl) {
    emailError = "No pay link available for this failure.";
    whatsAppError = "No pay link available for this failure.";
  } else {
    emailError = "Customer could not be resolved.";
    whatsAppError = "Customer could not be resolved.";
  }

  const recipients = await getBillingAlertSmsRecipients();
  if (recipients.length > 0 && failure.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: failure.customerId },
      select: { company: true, firstName: true, lastName: true },
    });
    const name = customer ? customerDisplayName(customer) : "Unknown customer";
    const billingUrl = `${getAppBaseUrl()}/admin/customers/${failure.customerId}/billing`;
    const declinePart = failure.declineCode ? ` — ${failure.declineCode}` : "";
    const cardPart = failure.last4 ? ` (•••• ${failure.last4})` : "";

    const smsBody = [
      "AUTOMATED — TL Portal",
      "",
      `Payment declined${declinePart}${cardPart}`,
      "",
      `Customer: ${name}`,
      `Amount: ${amountLabel}`,
      failure.invoiceNumber ? `Invoice: ${failure.invoiceNumber}` : null,
      "",
      `Follow up: ${billingUrl}`,
    ]
      .filter((line): line is string => line != null)
      .join("\n");

    for (const to of recipients) {
      const result = await sendTwilioAdminSms(to, smsBody);
      if (result.ok) {
        smsRecipientCount += 1;
      } else {
        smsErrors.push(`${to}: ${result.error}`);
      }
    }
  }

  const summaryParts = [`Payment declined — ${amountLabel}`];
  if (failure.declineCode) summaryParts.push(failure.declineCode);
  if (emailSent) summaryParts.push("customer emailed");
  if (whatsAppSent) summaryParts.push("customer WhatsApp");
  if (smsRecipientCount > 0) summaryParts.push(`${smsRecipientCount} staff SMS`);

  await recordOperationalEvent({
    category: "billing.payment_failed",
    customerId: failure.customerId ?? undefined,
    summary: summaryParts.join(" · "),
    payload: {
      paymentIntentId: failure.paymentIntentId,
      kind: failure.kind,
      tlInvoiceId: failure.tlInvoiceId,
      stripeInvoiceId: failure.stripeInvoiceId,
      invoiceNumber: failure.invoiceNumber,
      amount: failure.amount,
      currency: failure.currency,
      last4: failure.last4,
      declineCode: failure.declineCode,
      payUrl: failure.payUrl,
      payLinkToken,
      emailSent,
      emailError,
      whatsAppSent,
      whatsAppError,
      smsRecipientCount,
      smsErrors: smsErrors.length > 0 ? smsErrors : undefined,
    },
  });
}

export type NativeInvoiceDeclineFollowUp = {
  occurredAt: Date;
  amount: number;
  currency: string;
  declineCode: string | null;
  last4: string | null;
  emailSent: boolean;
  emailError: string | null;
  whatsAppSent: boolean;
  whatsAppError: string | null;
  smsRecipientCount: number;
};

export async function getNativeInvoiceDeclineFollowUp(
  invoiceId: string,
  withinDays = 7,
): Promise<NativeInvoiceDeclineFollowUp | null> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const row = await prisma.operationalEvent.findFirst({
    where: {
      category: "billing.payment_failed",
      occurredAt: { gte: since },
      payload: {
        path: ["tlInvoiceId"],
        equals: invoiceId,
      },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true, payload: true },
  });
  if (!row) return null;

  const payload = row.payload as {
    amount?: number;
    currency?: string;
    declineCode?: string | null;
    last4?: string | null;
    emailSent?: boolean;
    emailError?: string | null;
    whatsAppSent?: boolean;
    whatsAppError?: string | null;
    smsRecipientCount?: number;
  } | null;

  return {
    occurredAt: row.occurredAt,
    amount: payload?.amount ?? 0,
    currency: payload?.currency ?? "XCD",
    declineCode: payload?.declineCode ?? null,
    last4: payload?.last4 ?? null,
    emailSent: payload?.emailSent === true,
    emailError: payload?.emailError ?? null,
    whatsAppSent: payload?.whatsAppSent === true,
    whatsAppError: payload?.whatsAppError ?? null,
    smsRecipientCount: payload?.smsRecipientCount ?? 0,
  };
}

export async function getRecentNativeInvoicePaymentFailure(
  invoiceId: string,
): Promise<{ declineCode: string | null; guidance: string; occurredAt: Date } | null> {
  const followUp = await getNativeInvoiceDeclineFollowUp(invoiceId, RECENT_FAILURE_HOURS / 24);
  if (!followUp) return null;
  return {
    declineCode: followUp.declineCode,
    guidance: declineCodeGuidance(followUp.declineCode),
    occurredAt: followUp.occurredAt,
  };
}

export function paymentFailureEmailFollowUpLabel(input: {
  emailSent: boolean;
  emailError: string | null;
}): string {
  if (input.emailSent) return "Email sent";
  if (input.emailError?.toLowerCase().includes("no email")) return "No email on file";
  if (input.emailError) return "Email not sent";
  return "Email not sent";
}

export function paymentFailureWhatsAppFollowUpLabel(input: {
  whatsAppSent: boolean;
  whatsAppError: string | null;
}): string {
  if (input.whatsAppSent) return "WhatsApp sent";
  const err = input.whatsAppError?.toLowerCase() ?? "";
  if (err.includes("phone")) return "No phone for WhatsApp";
  if (err.includes("not configured")) return "WhatsApp not configured";
  if (input.whatsAppError) return "WhatsApp not sent";
  return "WhatsApp not sent";
}

export async function listRecentPaymentFailureAttentionItems(limit = 6): Promise<
  {
    customerId: string;
    customer: { id: string; company: string | null; firstName: string | null; lastName: string | null };
    amount: number;
    currency: string;
    declineCode: string | null;
    invoiceNumber: string | null;
    occurredAt: Date;
    emailSent: boolean;
    emailError: string | null;
    whatsAppSent: boolean;
    whatsAppError: string | null;
    smsRecipientCount: number;
  }[]
> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.operationalEvent.findMany({
    where: {
      category: "billing.payment_failed",
      occurredAt: { gte: since },
      customerId: { not: null },
    },
    orderBy: { occurredAt: "desc" },
    take: 30,
    include: {
      customer: {
        select: { id: true, company: true, firstName: true, lastName: true },
      },
    },
  });

  const seen = new Set<string>();
  const out: Awaited<ReturnType<typeof listRecentPaymentFailureAttentionItems>> = [];

  for (const event of events) {
    if (!event.customerId || !event.customer) continue;
    if (seen.has(event.customerId)) continue;
    seen.add(event.customerId);

    const payload = event.payload as {
      amount?: number;
      currency?: string;
      declineCode?: string | null;
      invoiceNumber?: string | null;
      emailSent?: boolean;
      emailError?: string | null;
      whatsAppSent?: boolean;
      whatsAppError?: string | null;
      smsRecipientCount?: number;
    } | null;

    out.push({
      customerId: event.customerId,
      customer: event.customer,
      amount: payload?.amount ?? 0,
      currency: payload?.currency ?? "XCD",
      declineCode: payload?.declineCode ?? null,
      invoiceNumber: payload?.invoiceNumber ?? null,
      occurredAt: event.occurredAt,
      emailSent: payload?.emailSent === true,
      emailError: payload?.emailError ?? null,
      whatsAppSent: payload?.whatsAppSent === true,
      whatsAppError: payload?.whatsAppError ?? null,
      smsRecipientCount: payload?.smsRecipientCount ?? 0,
    });
    if (out.length >= limit) break;
  }

  return out;
}

/** Customer IDs with a recorded card decline in the last N days. */
export async function listRecentPaymentFailureCustomerIds(withinDays = 7): Promise<Set<string>> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const events = await prisma.operationalEvent.findMany({
    where: {
      category: "billing.payment_failed",
      occurredAt: { gte: since },
      customerId: { not: null },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  return new Set(events.map((e) => e.customerId!).filter(Boolean));
}

export type CustomerPaymentDeclineFollowUp = {
  eventId: string;
  occurredAt: Date;
  amount: number;
  currency: string;
  declineCode: string | null;
  invoiceNumber: string | null;
  kind: PaymentFailureDeclineKind | null;
  last4: string | null;
  emailSent: boolean;
  emailError: string | null;
  whatsAppSent: boolean;
  whatsAppError: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  payLinkToken: string | null;
  smsRecipientCount: number;
  payUrl: string | null;
};

/** Latest recorded card decline and follow-up delivery status for billing UI. */
export async function getLatestPaymentDeclineFollowUpForCustomer(
  customerId: string,
  withinDays = 7,
): Promise<CustomerPaymentDeclineFollowUp | null> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const event = await prisma.operationalEvent.findFirst({
    where: {
      category: "billing.payment_failed",
      customerId,
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "desc" },
    select: { id: true, occurredAt: true, payload: true },
  });
  if (!event) return null;

  const payload = event.payload as {
    amount?: number;
    currency?: string;
    declineCode?: string | null;
    invoiceNumber?: string | null;
    kind?: PaymentFailureDeclineKind | null;
    last4?: string | null;
    emailSent?: boolean;
    emailError?: string | null;
    whatsAppSent?: boolean;
    whatsAppError?: string | null;
    payLinkToken?: string | null;
    smsRecipientCount?: number;
    payUrl?: string | null;
  } | null;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, phone: true },
  });

  return {
    eventId: event.id,
    occurredAt: event.occurredAt,
    amount: payload?.amount ?? 0,
    currency: payload?.currency ?? "XCD",
    declineCode: payload?.declineCode ?? null,
    invoiceNumber: payload?.invoiceNumber ?? null,
    kind: payload?.kind ?? null,
    last4: payload?.last4 ?? null,
    emailSent: payload?.emailSent === true,
    emailError: payload?.emailError ?? null,
    whatsAppSent: payload?.whatsAppSent === true,
    whatsAppError: payload?.whatsAppError ?? null,
    customerEmail: customer?.email?.trim() || null,
    customerPhone: customer?.phone?.trim() || null,
    payLinkToken: payload?.payLinkToken ?? null,
    smsRecipientCount: payload?.smsRecipientCount ?? 0,
    payUrl: payload?.payUrl ?? null,
  };
}

export type ResendPaymentDeclineEmailResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/** Staff-triggered resend of the decline follow-up email (same template as automatic send). */
export async function resendPaymentDeclineEmailForCustomer(
  customerId: string,
  actorUserId?: string | null,
): Promise<ResendPaymentDeclineEmailResult> {
  const followUp = await getLatestPaymentDeclineFollowUpForCustomer(customerId, 7);
  if (!followUp) {
    return { ok: false, error: "No recent payment decline on file for this customer." };
  }
  if (!followUp.payUrl || followUp.payUrl.includes("/admin/")) {
    return { ok: false, error: "No customer pay link is available for this decline." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, company: true, firstName: true, lastName: true },
  });
  const email = customer?.email?.trim();
  if (!customer || !email) {
    return { ok: false, error: "Customer has no email on file. Add one on the profile first." };
  }

  const amountLabel = formatMoney(followUp.amount, followUp.currency);
  const body = paymentFailureEmailBody({
    greetingName: customerDisplayName(customer),
    amountLabel,
    kind: followUp.kind,
    invoiceNumber: followUp.invoiceNumber,
    payUrl: followUp.payUrl,
    declineCode: followUp.declineCode,
  });

  const sent = await sendAppEmail({
    to: email,
    subject: body.subject,
    text: body.text,
    html: body.html,
  });
  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  const existingEvent = await prisma.operationalEvent.findUnique({
    where: { id: followUp.eventId },
    select: { payload: true },
  });
  const existingPayload =
    existingEvent?.payload && typeof existingEvent.payload === "object" && !Array.isArray(existingEvent.payload)
      ? (existingEvent.payload as Record<string, unknown>)
      : {};

  await prisma.operationalEvent.update({
    where: { id: followUp.eventId },
    data: {
      payload: {
        ...existingPayload,
        emailSent: true,
        emailError: null,
        emailResentAt: new Date().toISOString(),
        emailResentBy: actorUserId ?? null,
      },
    },
  });

  await recordOperationalEvent({
    category: "billing.payment_decline_email_resent",
    customerId,
    actorUserId: actorUserId ?? undefined,
    summary: `Decline email resent to ${email}`,
    payload: {
      sourceEventId: followUp.eventId,
      amount: followUp.amount,
      currency: followUp.currency,
      declineCode: followUp.declineCode,
      invoiceNumber: followUp.invoiceNumber,
      payUrl: followUp.payUrl,
    },
  });

  return { ok: true, email };
}

export type ResendPaymentDeclineWhatsAppResult =
  | { ok: true; phone: string }
  | { ok: false; error: string };

/** Staff-triggered resend of the decline follow-up over WhatsApp (same approved template). */
export async function resendPaymentDeclineWhatsAppForCustomer(
  customerId: string,
  actorUserId?: string | null,
): Promise<ResendPaymentDeclineWhatsAppResult> {
  const followUp = await getLatestPaymentDeclineFollowUpForCustomer(customerId, 7);
  if (!followUp) {
    return { ok: false, error: "No recent payment decline on file for this customer." };
  }
  if (!followUp.payUrl || followUp.payUrl.includes("/admin/")) {
    return { ok: false, error: "No customer pay link is available for this decline." };
  }
  if (!isTwilioWhatsAppConfigured()) {
    return { ok: false, error: "Twilio WhatsApp is not configured." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, company: true, firstName: true, lastName: true },
  });
  if (!customer || !toWhatsAppAddress(customer.phone)) {
    return { ok: false, error: "Customer has no valid phone on file for WhatsApp." };
  }

  // Reuse the original decline's redirect token, or mint one on the source event for legacy records.
  let payLinkToken = followUp.payLinkToken;
  if (!payLinkToken) {
    payLinkToken = newPayLinkToken();
    const existingEvent = await prisma.operationalEvent.findUnique({
      where: { id: followUp.eventId },
      select: { payload: true },
    });
    const existingPayload =
      existingEvent?.payload && typeof existingEvent.payload === "object" && !Array.isArray(existingEvent.payload)
        ? (existingEvent.payload as Record<string, unknown>)
        : {};
    await prisma.operationalEvent.update({
      where: { id: followUp.eventId },
      data: { payload: { ...existingPayload, payLinkToken } },
    });
  }

  const amountLabel = formatMoney(followUp.amount, followUp.currency);
  const { bodyLabel } = customerFacingDeclinePaymentLabel({
    kind: followUp.kind,
    invoiceNumber: followUp.invoiceNumber,
  });

  const result = await sendPaymentDeclineWhatsApp({
    customer,
    reasonPhrase: declineCodeShortReason(followUp.declineCode),
    paymentLabel: bodyLabel,
    amountLabel,
    payLinkToken,
    externalRef: followUp.eventId,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const eventForUpdate = await prisma.operationalEvent.findUnique({
    where: { id: followUp.eventId },
    select: { payload: true },
  });
  const payloadForUpdate =
    eventForUpdate?.payload && typeof eventForUpdate.payload === "object" && !Array.isArray(eventForUpdate.payload)
      ? (eventForUpdate.payload as Record<string, unknown>)
      : {};

  await prisma.operationalEvent.update({
    where: { id: followUp.eventId },
    data: {
      payload: {
        ...payloadForUpdate,
        whatsAppSent: true,
        whatsAppError: null,
        whatsAppResentAt: new Date().toISOString(),
        whatsAppResentBy: actorUserId ?? null,
      },
    },
  });

  await recordOperationalEvent({
    category: "billing.payment_decline_whatsapp_resent",
    customerId,
    actorUserId: actorUserId ?? undefined,
    summary: `Decline WhatsApp resent to ${customer.phone ?? "customer"}`,
    payload: {
      sourceEventId: followUp.eventId,
      amount: followUp.amount,
      currency: followUp.currency,
      declineCode: followUp.declineCode,
      invoiceNumber: followUp.invoiceNumber,
      payUrl: followUp.payUrl,
    },
  });

  return { ok: true, phone: customer.phone ?? "" };
}
