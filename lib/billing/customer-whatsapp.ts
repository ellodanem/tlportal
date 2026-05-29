import "server-only";

import type { Customer } from "@prisma/client";

import { prisma } from "@/lib/db";
import { invoilessInvoicePreviewUrl } from "@/lib/invoiless/preview-url";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";
import { isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { toWhatsAppAddress } from "@/lib/twilio/phone";
import { sendTwilioWhatsAppContent, type SendBillingWhatsAppResult } from "@/lib/twilio/whatsapp-send";
import { CHECKOUT_LINK_VALID_HOURS } from "@/lib/stripe/checkout-messaging";

export type CustomerWhatsAppDeliveryKind = "stripe_checkout" | "invoiless_invoice_new";

function customerFirstName(customer: Pick<Customer, "firstName" | "lastName" | "company">): string {
  const first = customer.firstName?.trim();
  if (first) return first;
  const company = customer.company?.trim();
  if (company) return company;
  const full = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return full || "there";
}

function formatDueDateLabelYmd(ymd: string | null | undefined): string {
  if (!ymd?.trim()) return "—";
  const d = new Date(`${ymd.trim().slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function isInvoiceStatusEligibleForCustomerWhatsApp(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s !== "draft";
}

async function recordDelivery(
  customerId: string,
  kind: CustomerWhatsAppDeliveryKind,
  externalRef: string,
  messageSid: string,
): Promise<void> {
  await prisma.customerWhatsAppDelivery.upsert({
    where: {
      kind_externalRef: { kind, externalRef },
    },
    create: {
      customerId,
      kind,
      externalRef,
      twilioMessageSid: messageSid,
    },
    update: {
      twilioMessageSid: messageSid,
      sentAt: new Date(),
    },
  });
}

export async function sendStripePaymentLinkWhatsApp(input: {
  customer: Pick<Customer, "id" | "firstName" | "lastName" | "company" | "phone">;
  paymentUrl: string;
  checkoutSessionId: string;
  amountLine: string;
  isResend: boolean;
}): Promise<SendBillingWhatsAppResult> {
  if (!isTwilioWhatsAppConfigured()) {
    return { ok: false, error: "Twilio WhatsApp is not configured." };
  }

  const to = toWhatsAppAddress(input.customer.phone);
  if (!to) {
    return { ok: false, error: "Customer has no valid phone number for WhatsApp." };
  }

  const kind = input.isResend ? "stripe_payment_link_resend" : "stripe_payment_link";
  const result = await sendTwilioWhatsAppContent(to, kind, {
    "1": customerFirstName(input.customer),
    "2": input.amountLine,
    "3": input.paymentUrl,
    "4": `${CHECKOUT_LINK_VALID_HOURS} hours`,
  });

  if (result.ok) {
    await recordDelivery(input.customer.id, "stripe_checkout", input.checkoutSessionId, result.messageSid);
  }
  return result;
}

export async function sendNewInvoiceWhatsApp(input: {
  customer: Pick<Customer, "id" | "firstName" | "lastName" | "company" | "phone">;
  invoilessInvoiceId: string;
  invoiceNumber: string | null;
  amountDueLabel: string;
  dueDateYmd: string | null;
  previewUrl?: string | null;
}): Promise<SendBillingWhatsAppResult> {
  if (!isTwilioWhatsAppConfigured()) {
    return { ok: false, error: "Twilio WhatsApp is not configured." };
  }

  const existing = await prisma.customerWhatsAppDelivery.findUnique({
    where: {
      kind_externalRef: {
        kind: "invoiless_invoice_new",
        externalRef: input.invoilessInvoiceId,
      },
    },
  });
  if (existing) {
    return { ok: true, messageSid: existing.twilioMessageSid ?? "already_sent" };
  }

  const to = toWhatsAppAddress(input.customer.phone);
  if (!to) {
    return { ok: false, error: "Customer has no valid phone number for WhatsApp." };
  }

  const payLink = input.previewUrl?.trim() || invoilessInvoicePreviewUrl(input.invoilessInvoiceId);
  const invoiceLabel = input.invoiceNumber?.trim() || input.invoilessInvoiceId;

  const result = await sendTwilioWhatsAppContent(to, "invoice_new", {
    "1": customerFirstName(input.customer),
    "2": invoiceLabel,
    "3": input.amountDueLabel,
    "4": formatDueDateLabelYmd(input.dueDateYmd),
    "5": payLink,
  });

  if (result.ok) {
    await recordDelivery(
      input.customer.id,
      "invoiless_invoice_new",
      input.invoilessInvoiceId,
      result.messageSid,
    );
  }
  return result;
}

export function buildStripeCheckoutAmountLine(input: {
  monthlyRateXcd: number | null;
  durationMonths: number;
  vehicleCount: number;
}): string {
  const term = formatPlanTerm(input.durationMonths);
  const vehicles = Math.max(1, input.vehicleCount);
  if (input.monthlyRateXcd != null && input.monthlyRateXcd > 0) {
    const perPeriod = input.monthlyRateXcd * input.durationMonths * vehicles;
    return `${formatXcd(perPeriod)} · ${term} · ${vehicles} vehicle${vehicles === 1 ? "" : "s"}`;
  }
  return `${term} · ${vehicles} vehicle${vehicles === 1 ? "" : "s"}`;
}

export function sumInvoiceItemsXcd(
  items: Array<{ quantity: number; price: number }>,
): string {
  let total = 0;
  for (const i of items) {
    total += i.quantity * i.price;
  }
  return formatXcd(total);
}
