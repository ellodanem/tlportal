import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/domain/native-billing";
import { sendAppEmail } from "@/lib/email/send-mail";
import { getPortalTimezone } from "@/lib/portal/timezone-settings";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import { isTwilioWhatsAppConfigured, type TwilioWhatsAppBillingNotificationTemplateKey } from "@/lib/twilio/config";
import { normalizeWhatsAppPhone, toWhatsAppAddress } from "@/lib/twilio/phone";
import { sendTwilioWhatsAppContent } from "@/lib/twilio/whatsapp-send";

export const INVOICE_NOTIFICATION_EVENTS = [
  "manual_due_5d", "manual_due_3d", "manual_due_1d", "manual_overdue_1d", "manual_overdue_3d", "manual_overdue_7d", "manual_pause_warning_8d",
  "stripe_autopay_3d", "stripe_failed_overdue_1d", "stripe_failed_overdue_3d", "stripe_failed_overdue_7d", "stripe_pause_warning_8d",
] as const;
export type InvoiceNotificationEvent = (typeof INVOICE_NOTIFICATION_EVENTS)[number];

type EligibleInvoice = Awaited<ReturnType<typeof loadEligibleInvoices>>[number];
type DeliveryChannel = "email" | "whatsapp";

function ymd(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

function calendarDayDiff(dueDate: Date, now: Date, timezone: string): number {
  const due = Date.parse(`${ymd(dueDate, timezone)}T12:00:00Z`);
  const today = Date.parse(`${ymd(now, timezone)}T12:00:00Z`);
  return Math.round((due - today) / 86_400_000);
}

function greeting(customer: { firstName: string | null; lastName: string | null; company: string | null }): string {
  return customer.firstName?.trim() || customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "there";
}

function isReminderEnabled(customer: { paymentReminders: "auto" | "on" | "off" }): boolean {
  return customer.paymentReminders !== "off";
}

function eventFor(invoice: EligibleInvoice, diff: number): InvoiceNotificationEvent | null {
  const manual = invoice.customer!.billingMode === "manual_legacy";
  if (manual) {
    return ({ 5: "manual_due_5d", 3: "manual_due_3d", 1: "manual_due_1d", "-1": "manual_overdue_1d", "-3": "manual_overdue_3d", "-7": "manual_overdue_7d", "-8": "manual_pause_warning_8d" } as Record<string, InvoiceNotificationEvent | undefined>)[String(diff)] ?? null;
  }
  return ({ 3: "stripe_autopay_3d", "-1": "stripe_failed_overdue_1d", "-3": "stripe_failed_overdue_3d", "-7": "stripe_failed_overdue_7d", "-8": "stripe_pause_warning_8d" } as Record<string, InvoiceNotificationEvent | undefined>)[String(diff)] ?? null;
}

function isFinalWarning(event: InvoiceNotificationEvent): boolean {
  return event === "manual_pause_warning_8d" || event === "stripe_pause_warning_8d";
}

function isUpcoming(event: InvoiceNotificationEvent): boolean {
  return event.endsWith("due_5d") || event.endsWith("due_3d") || event.endsWith("due_1d") || event === "stripe_autopay_3d";
}

function whatsappTemplate(event: InvoiceNotificationEvent): TwilioWhatsAppBillingNotificationTemplateKey {
  if (isFinalWarning(event)) return "billing_pause_warning";
  if (event === "stripe_autopay_3d") return "billing_stripe_upcoming";
  return isUpcoming(event) ? "billing_manual_upcoming" : "billing_overdue";
}

function dueLabel(dueDate: Date, timezone: string): string {
  return formatInTimeZone(dueDate, timezone, "d MMMM yyyy");
}

function payUrl(invoice: EligibleInvoice): string | null {
  if (invoice.publicToken) return `${getAppBaseUrl()}/pay/i/${encodeURIComponent(invoice.publicToken)}`;
  return invoice.billingInvoice?.hostedInvoiceUrl ?? null;
}

function emailCopy(input: { invoice: EligibleInvoice; event: InvoiceNotificationEvent; timezone: string; payUrl: string }): { subject: string; text: string } {
  const { invoice, event, timezone } = input;
  const name = greeting(invoice.customer!);
  const number = invoice.number ?? invoice.billingInvoice?.displayNumber ?? "your invoice";
  const amount = formatMoney(Number(invoice.amountDue), invoice.currency);
  const due = dueLabel(invoice.dueDate!, timezone);
  const late = Math.max(0, -calendarDayDiff(invoice.dueDate!, new Date(), timezone));
  if (isFinalWarning(event)) {
    return { subject: `Action required: service pause warning — ${number}`, text: `Hi ${name},\n\n${number} for ${amount} remains unpaid after its due date of ${due}. Your Track Lucia service is scheduled to be paused until payment is received. Please pay or contact us immediately.\n\nPay now: ${input.payUrl}\n\nIf you have already paid, please disregard this message.\n\nTrack Lucia` };
  }
  if (event === "stripe_autopay_3d") {
    return { subject: `Upcoming automatic payment — ${number}`, text: `Hi ${name},\n\nYour Track Lucia payment of ${amount} is scheduled to be charged automatically on ${due}. Please ensure your billing details and available funds are up to date. No action is needed if everything is correct.\n\nReview billing: ${input.payUrl}\n\nTrack Lucia` };
  }
  if (isUpcoming(event)) {
    const days = calendarDayDiff(invoice.dueDate!, new Date(), timezone);
    return { subject: `Invoice ${number} is due soon`, text: `Hi ${name},\n\n${number} for ${amount} is due on ${due} (${days} day${days === 1 ? "" : "s"} from now). Please review and pay your invoice.\n\nView invoice: ${input.payUrl}\n\nIf you have already paid, please disregard this reminder.\n\nTrack Lucia` };
  }
  return { subject: `Payment overdue — ${number}`, text: `Hi ${name},\n\n${number} for ${amount} was due on ${due} and is now ${late} day${late === 1 ? "" : "s"} overdue. Please review and pay it.\n\nPay now: ${input.payUrl}\n\nIf payment has already been made, please reply with the payment details.\n\nTrack Lucia` };
}

async function loadEligibleInvoices() {
  return prisma.invoice.findMany({
    where: { dueDate: { not: null }, amountDue: { gt: 0 }, status: { in: ["open", "partially_paid", "overdue"] }, archivedAt: null, customerId: { not: null }, customer: { archivedAt: null } },
    include: { customer: { select: { id: true, firstName: true, lastName: true, company: true, email: true, phone: true, billingMode: true, paymentReminders: true } }, billingInvoice: { select: { hostedInvoiceUrl: true, displayNumber: true } } },
  });
}

function deliveryKey(invoiceId: string, event: InvoiceNotificationEvent, channel: DeliveryChannel): string {
  return `invoice:${invoiceId}:${event}:${channel}`;
}

async function recordAttempt(input: { invoice: EligibleInvoice; event: InvoiceNotificationEvent; channel: DeliveryChannel; destination: string | null; timezone: string; actorUserId?: string | null; force?: boolean }): Promise<{ outcome: "sent" | "failed" | "suppressed"; error?: string }> {
  const key = deliveryKey(input.invoice.id, input.event, input.channel);
  const existing = await prisma.billingNotificationDelivery.findUnique({ where: { idempotencyKey: key } });
  if (existing?.status === "sent" && !input.force) return { outcome: "suppressed" };
  if (!input.invoice.customer || !input.invoice.dueDate || input.invoice.amountDue.lte(0)) return { outcome: "suppressed" };
  const url = payUrl(input.invoice);
  if (!url) return { outcome: "suppressed", error: "No customer-safe payment link is available." };

  const delivery = await prisma.billingNotificationDelivery.upsert({
    where: { idempotencyKey: key },
    create: { idempotencyKey: key, customerId: input.invoice.customer.id, invoiceId: input.invoice.id, eventKind: input.event, channel: input.channel, status: "sending", destination: input.destination, attempts: 1, claimedAt: new Date(), retriedById: input.actorUserId ?? null },
    update: { status: "sending", destination: input.destination, attempts: { increment: 1 }, claimedAt: new Date(), lastError: null, retriedById: input.actorUserId ?? undefined },
  });

  let result: { ok: boolean; error?: string; providerMessageId?: string };
  if (input.channel === "email") {
    if (!input.destination) result = { ok: false, error: "Customer has no email address." };
    else {
      const copy = emailCopy({ invoice: input.invoice, event: input.event, timezone: input.timezone, payUrl: url });
      const sent = await sendAppEmail({ to: input.destination, subject: copy.subject, text: copy.text });
      result = sent.ok ? { ok: true } : { ok: false, error: sent.error };
    }
  } else if (!isTwilioWhatsAppConfigured()) {
    result = { ok: false, error: "Twilio WhatsApp is not configured." };
  } else if (!input.destination || !toWhatsAppAddress(input.destination)) {
    result = { ok: false, error: "Customer has no valid WhatsApp phone number." };
  } else {
    const days = Math.abs(calendarDayDiff(input.invoice.dueDate, new Date(), input.timezone));
    const sent = await sendTwilioWhatsAppContent(toWhatsAppAddress(input.destination)!, whatsappTemplate(input.event), {
      "1": greeting(input.invoice.customer), "2": input.invoice.number ?? input.invoice.billingInvoice?.displayNumber ?? "Invoice", "3": formatMoney(Number(input.invoice.amountDue), input.invoice.currency), "4": dueLabel(input.invoice.dueDate, input.timezone), "5": String(days), "6": url,
    });
    result = sent.ok ? { ok: true, providerMessageId: sent.messageSid } : { ok: false, error: sent.error };
  }

  if (result.ok) {
    await prisma.billingNotificationDelivery.update({ where: { id: delivery.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: result.providerMessageId ?? null, lastError: null } });
    return { outcome: "sent" };
  }
  await prisma.billingNotificationDelivery.update({ where: { id: delivery.id }, data: { status: "failed", lastError: result.error ?? "Delivery failed." } });
  return { outcome: "failed", error: result.error };
}

export async function processInvoiceNotificationReminders(now = new Date()) {
  const timezone = await getPortalTimezone();
  const invoices = await loadEligibleInvoices();
  const totals = { sent: 0, failed: 0, suppressed: 0, pausePending: 0 };
  for (const invoice of invoices) {
    if (!invoice.customer || !invoice.dueDate || !isReminderEnabled(invoice.customer)) continue;
    const event = eventFor(invoice, calendarDayDiff(invoice.dueDate, now, timezone));
    if (!event || !payUrl(invoice)) continue;
    for (const [channel, destination] of [["email", invoice.customer.email?.trim() || null], ["whatsapp", normalizeWhatsAppPhone(invoice.customer.phone)]] as const) {
      const outcome = await recordAttempt({ invoice, event, channel, destination, timezone });
      totals[outcome.outcome] += 1;
    }
    if (isFinalWarning(event)) {
      const key = `invoice:${invoice.id}:${event}:pause-pending`;
      const existing = await prisma.operationalEvent.findFirst({ where: { category: "billing.pause_pending", payload: { path: ["idempotencyKey"], equals: key } }, select: { id: true } });
      if (!existing) {
        await recordOperationalEvent({ category: "billing.pause_pending", customerId: invoice.customer.id, summary: `Service pause review required — ${invoice.number ?? invoice.id.slice(0, 8)}`, payload: { idempotencyKey: key, invoiceId: invoice.id, eventKind: event, dueDate: invoice.dueDate.toISOString() } });
        totals.pausePending += 1;
      }
    }
  }
  return { ok: true, timezone, invoicesChecked: invoices.length, ...totals };
}

/** Staff retry for a failed delivery. The invoice is revalidated immediately before send. */
export async function retryBillingNotificationDelivery(deliveryId: string, actorUserId?: string | null) {
  const row = await prisma.billingNotificationDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      invoice: {
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, company: true, email: true, phone: true, billingMode: true, paymentReminders: true, archivedAt: true } },
          billingInvoice: { select: { hostedInvoiceUrl: true, displayNumber: true } },
        },
      },
    },
  });
  if (!row || !row.invoice || !row.invoice.customer || row.status !== "failed") return { ok: false as const, error: "Only a failed invoice notification can be retried." };
  if (row.invoice.archivedAt || row.invoice.amountDue.lte(0) || !["open", "partially_paid", "overdue"].includes(row.invoice.status)) return { ok: false as const, error: "Not resent because the invoice is no longer payable." };
  const timezone = await getPortalTimezone();
  const outcome = await recordAttempt({ invoice: row.invoice, event: row.eventKind as InvoiceNotificationEvent, channel: row.channel, destination: row.channel === "email" ? row.invoice.customer.email?.trim() || null : normalizeWhatsAppPhone(row.invoice.customer.phone), timezone, actorUserId, force: true });
  return outcome.outcome === "sent" ? { ok: true as const } : { ok: false as const, error: outcome.error ?? "Notification was not sent." };
}

/** Send the customer-facing success confirmation after a Stripe invoice is paid. */
export async function sendStripePaymentReceivedNotification(billingInvoiceId: string): Promise<void> {
  const invoice = await prisma.billingInvoice.findUnique({
    where: { id: billingInvoiceId },
    include: { customer: { select: { id: true, firstName: true, lastName: true, company: true, email: true, phone: true, archivedAt: true } } },
  });
  if (!invoice || invoice.status.toLowerCase() !== "paid" || invoice.customer.archivedAt) return;
  const amount = formatMoney(Number(invoice.amountXcd), invoice.currency);
  const number = invoice.displayNumber ?? invoice.providerInvoiceNumber ?? "your invoice";
  const name = greeting(invoice.customer);
  const baseKey = `stripe-paid:${billingInvoiceId}`;
  const channels: Array<{ channel: DeliveryChannel; destination: string | null }> = [
    { channel: "email", destination: invoice.customer.email?.trim() || null },
    { channel: "whatsapp", destination: normalizeWhatsAppPhone(invoice.customer.phone) },
  ];
  for (const item of channels) {
    const key = `${baseKey}:${item.channel}`;
    const prior = await prisma.billingNotificationDelivery.findUnique({ where: { idempotencyKey: key } });
    if (prior?.status === "sent") continue;
    const delivery = await prisma.billingNotificationDelivery.upsert({
      where: { idempotencyKey: key },
      create: { idempotencyKey: key, customerId: invoice.customer.id, eventKind: "stripe_payment_received", channel: item.channel, status: "sending", destination: item.destination, attempts: 1, claimedAt: new Date() },
      update: { status: "sending", destination: item.destination, attempts: { increment: 1 }, claimedAt: new Date(), lastError: null },
    });
    let ok = false;
    let error: string | undefined;
    let providerMessageId: string | undefined;
    if (item.channel === "email") {
      if (!item.destination) error = "Customer has no email address.";
      else {
        const sent = await sendAppEmail({ to: item.destination, subject: `Payment received — ${number}`, text: `Hi ${name},\n\nYour payment of ${amount} for ${number} was successful. Your account is up to date. A receipt has been sent by email.\n\nThank you,\nTrack Lucia` });
        ok = sent.ok;
        error = sent.ok ? undefined : sent.error;
      }
    } else if (!item.destination || !toWhatsAppAddress(item.destination)) {
      error = "Customer has no valid WhatsApp phone number.";
    } else if (!isTwilioWhatsAppConfigured()) {
      error = "Twilio WhatsApp is not configured.";
    } else {
      const sent = await sendTwilioWhatsAppContent(toWhatsAppAddress(item.destination)!, "billing_payment_received", { "1": name, "2": amount, "3": number });
      ok = sent.ok;
      error = sent.ok ? undefined : sent.error;
      providerMessageId = sent.ok ? sent.messageSid : undefined;
    }
    await prisma.billingNotificationDelivery.update({ where: { id: delivery.id }, data: ok ? { status: "sent", sentAt: new Date(), providerMessageId: providerMessageId ?? null } : { status: "failed", lastError: error ?? "Delivery failed." } });
  }
}
