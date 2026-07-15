import "server-only";

import { defaultInvoiceEmailBody, defaultInvoiceEmailSubject } from "@/lib/billing/invoice-email-body";
import { getSmtpMailFrom, getSmtpTransportOptions } from "@/lib/email/smtp-settings";
import {
  checkoutInitialEmailBody,
  checkoutRecoveryEmailBody,
} from "@/lib/stripe/checkout-messaging";
import { paymentFailureEmailBody } from "@/lib/stripe/payment-failure-messaging";
import { canSendTwilioAdminSms } from "@/lib/twilio/admin-sms";
import {
  getTwilioContentSid,
  isTwilioWhatsAppConfigured,
  type TwilioWhatsAppTemplateKey,
} from "@/lib/twilio/config";

export type MessageTemplateChannel = "email" | "whatsapp" | "sms";
export type MessageTemplateAudience = "customer" | "staff";

export type MessageTemplateVariable = { token: string; meaning: string };

export type MessageTemplatePreview = { subject?: string; body: string };

export type MessageTemplateConfig = { ok: boolean; label: string };

export type MessageTemplateCatalogEntry = {
  id: string;
  name: string;
  channel: MessageTemplateChannel;
  audience: MessageTemplateAudience;
  trigger: string;
  variables: MessageTemplateVariable[];
  /** Rendered preview with sample data. Null for WhatsApp (copy is managed in Twilio). */
  preview: MessageTemplatePreview | null;
  config: MessageTemplateConfig;
  /** External place to edit the copy (Twilio for WhatsApp Content templates). */
  manageNote?: string;
  envVar?: string;
};

const SAMPLE = {
  firstName: "Newman",
  amountLabel: "EC$25.00",
  payUrl: "https://tlportal.vercel.app/pay/go/sample",
  invoiceNumber: "TL-INV-0001",
};

function whatsAppConfig(kind: TwilioWhatsAppTemplateKey): MessageTemplateConfig {
  if (!isTwilioWhatsAppConfigured()) {
    return { ok: false, label: "WhatsApp not configured" };
  }
  return getTwilioContentSid(kind)
    ? { ok: true, label: "Content SID set" }
    : { ok: false, label: "No Content SID" };
}

/** Build the full catalog of system message templates across channels, with live config health. */
export async function buildMessageTemplateCatalog(): Promise<MessageTemplateCatalogEntry[]> {
  const [transport, from] = await Promise.all([getSmtpTransportOptions(), getSmtpMailFrom()]);
  const emailConfig: MessageTemplateConfig = transport && from
    ? { ok: true, label: "SMTP ready" }
    : { ok: false, label: "SMTP not configured" };
  const smsConfig: MessageTemplateConfig = canSendTwilioAdminSms()
    ? { ok: true, label: "SMS ready" }
    : { ok: false, label: "SMS not configured" };

  // --- Email previews (real copy from the sender helpers) ---
  const declineEmail = paymentFailureEmailBody({
    greetingName: SAMPLE.firstName,
    amountLabel: SAMPLE.amountLabel,
    kind: "subscription",
    invoiceNumber: null,
    payUrl: SAMPLE.payUrl,
    declineCode: "do_not_honor",
  });
  const invoiceEmail = defaultInvoiceEmailBody({
    greetingName: SAMPLE.firstName,
    invoiceNumber: SAMPLE.invoiceNumber,
    dueDate: new Date(),
    amountDue: 25,
    currency: "XCD",
    payUrl: SAMPLE.payUrl,
    allowOnlinePayment: true,
  });
  const checkoutEmail = checkoutInitialEmailBody({
    greetingName: SAMPLE.firstName,
    paymentUrl: SAMPLE.payUrl,
    durationMonths: 1,
  });
  const checkoutRecovery = checkoutRecoveryEmailBody({
    greetingName: SAMPLE.firstName,
    recoveryUrl: SAMPLE.payUrl,
  });

  return [
    // ---------------- Email (customer) ----------------
    {
      id: "email.invoice",
      name: "Invoice email",
      channel: "email",
      audience: "customer",
      trigger: "Sending or scheduling a TL invoice to a customer.",
      variables: [
        { token: "Name", meaning: "Customer greeting name" },
        { token: "Invoice #", meaning: "Assigned TL-INV number" },
        { token: "Amount / due date", meaning: "Amount due and due date" },
        { token: "Pay link", meaning: "Public pay page" },
      ],
      preview: { subject: defaultInvoiceEmailSubject(SAMPLE.invoiceNumber), body: invoiceEmail.text },
      config: emailConfig,
    },
    {
      id: "email.payment_declined",
      name: "Payment declined email",
      channel: "email",
      audience: "customer",
      trigger: "Automatic on a Stripe card decline; also staff resend on Customer → Billing.",
      variables: [
        { token: "Name", meaning: "Customer greeting name" },
        { token: "Payment label", meaning: "Track Lucia Subscription / TL-INV-…" },
        { token: "Amount", meaning: "Declined amount" },
        { token: "Pay link", meaning: "Retry payment link" },
      ],
      preview: { subject: declineEmail.subject, body: declineEmail.text },
      config: emailConfig,
    },
    {
      id: "email.checkout_link",
      name: "Payment link email",
      channel: "email",
      audience: "customer",
      trigger: "Staff sends a Stripe Checkout subscription link (Customer → Billing → Send to customer).",
      variables: [
        { token: "Name", meaning: "Customer greeting name" },
        { token: "Pay link", meaning: "Stripe Checkout link" },
        { token: "Billing term", meaning: "1 month / 3 months / … (auto-charge line)" },
      ],
      preview: { subject: "Complete your Track Lucia subscription payment", body: checkoutEmail.text },
      config: emailConfig,
    },
    {
      id: "email.checkout_recovery",
      name: "Payment link recovery email",
      channel: "email",
      audience: "customer",
      trigger: "Follow-up when an earlier Checkout link expired before payment.",
      variables: [
        { token: "Name", meaning: "Customer greeting name" },
        { token: "Recovery link", meaning: "New Checkout link (valid up to 30 days)" },
      ],
      preview: { subject: "Complete your Track Lucia subscription", body: checkoutRecovery.text },
      config: emailConfig,
    },

    // ---------------- WhatsApp (customer) — copy managed in Twilio ----------------
    {
      id: "whatsapp.payment_declined",
      name: "Payment declined (WhatsApp)",
      channel: "whatsapp",
      audience: "customer",
      trigger: "Automatic on a Stripe card decline; also staff resend on Customer → Billing.",
      variables: [
        { token: "{{1}}", meaning: "First name" },
        { token: "{{2}}", meaning: "Short decline reason" },
        { token: "{{3}}", meaning: "Payment label (your Track Lucia Subscription / TL-INV-…)" },
        { token: "{{4}}", meaning: "Amount" },
        { token: "{{5}}", meaning: "Pay-link token (/pay/go/{{5}})" },
      ],
      preview: null,
      config: whatsAppConfig("payment_declined"),
      manageNote: "Copy is a Meta-approved Twilio Content template; edit in Twilio.",
      envVar: "TWILIO_WA_TEMPLATE_PAYMENT_DECLINED",
    },
    {
      id: "whatsapp.stripe_payment_link",
      name: "Payment link (WhatsApp)",
      channel: "whatsapp",
      audience: "customer",
      trigger: "Staff sends a Stripe Checkout link over WhatsApp (initial + resend variants).",
      variables: [
        { token: "{{1}}", meaning: "First name" },
        { token: "{{2}}", meaning: "Amount / term / vehicles" },
        { token: "{{3}}", meaning: "Pay link" },
        { token: "{{4}}", meaning: "Validity window" },
        { token: "{{5}}", meaning: "Billing term (e.g. 3 months) for the auto-charge line" },
      ],
      preview: null,
      config: whatsAppConfig("stripe_payment_link"),
      manageNote:
        "Meta-approved Twilio Content template; edit in Twilio. Include: Once this payment link is paid, your card will *automatically* be charged every *{{5}}* from the payment date.",
      envVar: "TWILIO_WA_TEMPLATE_STRIPE_PAYMENT_LINK",
    },
    {
      id: "whatsapp.invoice_new",
      name: "New invoice (WhatsApp)",
      channel: "whatsapp",
      audience: "customer",
      trigger: "A new (non-draft) invoice is created for a WhatsApp-eligible customer.",
      variables: [
        { token: "{{1}}", meaning: "First name" },
        { token: "{{2}}", meaning: "Invoice label" },
        { token: "{{3}}", meaning: "Amount due" },
        { token: "{{4}}", meaning: "Due date" },
        { token: "{{5}}", meaning: "Pay link" },
      ],
      preview: null,
      config: whatsAppConfig("invoice_new"),
      manageNote: "Meta-approved Twilio Content template; edit in Twilio.",
      envVar: "TWILIO_WA_TEMPLATE_INVOICE_NEW",
    },
    {
      id: "whatsapp.reminders",
      name: "Payment reminders (WhatsApp)",
      channel: "whatsapp",
      audience: "customer",
      trigger: "Scheduled subscription nudges: 5/3/0 days before due and 3/5 days overdue.",
      variables: [
        { token: "{{1}}", meaning: "First name" },
        { token: "{{2}}", meaning: "Due date" },
        { token: "{{3}}", meaning: "Amount due" },
        { token: "{{4}}", meaning: "Pay link" },
      ],
      preview: null,
      config: whatsAppConfig("due_3d"),
      manageNote: "Five Meta-approved templates (due_5d…overdue_5d); edit in Twilio.",
      envVar: "TWILIO_WA_TEMPLATE_DUE_*/_OVERDUE_*",
    },

    // ---------------- SMS (staff) ----------------
    {
      id: "sms.payment_decline_alert",
      name: "Payment decline staff alert (SMS)",
      channel: "sms",
      audience: "staff",
      trigger: "Automatic on a Stripe card decline — sent to billing alert phone numbers.",
      variables: [
        { token: "Customer", meaning: "Customer name" },
        { token: "Amount", meaning: "Declined amount" },
        { token: "Decline code / card", meaning: "Reason and last 4" },
        { token: "Follow up", meaning: "Link to Customer → Billing" },
      ],
      preview: {
        body:
          "AUTOMATED — TL Portal\n\nPayment declined — do_not_honor (•••• 7521)\n\n" +
          `Customer: ${SAMPLE.firstName}\nAmount: ${SAMPLE.amountLabel}\n\n` +
          "Follow up: https://tlportal.vercel.app/admin/customers/…/billing",
      },
      config: smsConfig,
    },
  ];
}
