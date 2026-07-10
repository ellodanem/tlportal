export type QuickWhatsAppTemplateKind =
  | "payment_declined"
  | "stripe_payment_link"
  | "stripe_payment_link_resend"
  | "invoice_new"
  | "due_5d"
  | "due_3d"
  | "due_0d"
  | "overdue_3d"
  | "overdue_5d";

export type QuickWhatsAppVariableField = {
  key: string;
  label: string;
  placeholder?: string;
  /** Prefill from customer first name when true. */
  fromFirstName?: boolean;
};

export type QuickWhatsAppTemplateDef = {
  kind: QuickWhatsAppTemplateKind;
  name: string;
  description: string;
  fields: QuickWhatsAppVariableField[];
};

/** Approved WhatsApp templates staff can send one-off from Message templates. */
export const QUICK_WHATSAPP_TEMPLATES: QuickWhatsAppTemplateDef[] = [
  {
    kind: "payment_declined",
    name: "Payment declined",
    description: "Decline notice with Pay now button (/pay/go/{{5}}).",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Decline reason", placeholder: "your bank declined the charge" },
      { key: "3", label: "Payment label", placeholder: "your Track Lucia Subscription" },
      { key: "4", label: "Amount", placeholder: "EC$25.00" },
      { key: "5", label: "Pay-link token", placeholder: "token only (not full URL)" },
    ],
  },
  {
    kind: "stripe_payment_link",
    name: "Payment link",
    description: "Stripe Checkout subscription link.",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Amount / term", placeholder: "EC$25 · 1 month · 1 vehicle" },
      { key: "3", label: "Pay link", placeholder: "https://…" },
      { key: "4", label: "Validity", placeholder: "24 hours" },
    ],
  },
  {
    kind: "stripe_payment_link_resend",
    name: "Payment link (resend)",
    description: "Resend variant of the Checkout link template.",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Amount / term", placeholder: "EC$25 · 1 month · 1 vehicle" },
      { key: "3", label: "Pay link", placeholder: "https://…" },
      { key: "4", label: "Validity", placeholder: "24 hours" },
    ],
  },
  {
    kind: "invoice_new",
    name: "New invoice",
    description: "New invoice notice with amount, due date, and pay link.",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Invoice label", placeholder: "TL-INV-0001" },
      { key: "3", label: "Amount due", placeholder: "EC$25.00" },
      { key: "4", label: "Due date", placeholder: "15 July 2026" },
      { key: "5", label: "Pay link", placeholder: "https://…" },
    ],
  },
  {
    kind: "due_5d",
    name: "Reminder — due in 5 days",
    description: "Scheduled payment nudge (5 days before due).",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Due date", placeholder: "15 July 2026" },
      { key: "3", label: "Amount due", placeholder: "EC$25.00" },
      { key: "4", label: "Pay link", placeholder: "https://…" },
    ],
  },
  {
    kind: "due_3d",
    name: "Reminder — due in 3 days",
    description: "Scheduled payment nudge (3 days before due).",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Due date", placeholder: "15 July 2026" },
      { key: "3", label: "Amount due", placeholder: "EC$25.00" },
      { key: "4", label: "Pay link", placeholder: "https://…" },
    ],
  },
  {
    kind: "due_0d",
    name: "Reminder — due today",
    description: "Scheduled payment nudge (due today).",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Due date", placeholder: "15 July 2026" },
      { key: "3", label: "Amount due", placeholder: "EC$25.00" },
      { key: "4", label: "Pay link", placeholder: "https://…" },
    ],
  },
  {
    kind: "overdue_3d",
    name: "Reminder — overdue 3 days",
    description: "Overdue payment nudge (+3 days).",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Due date", placeholder: "15 July 2026" },
      { key: "3", label: "Amount due", placeholder: "EC$25.00" },
      { key: "4", label: "Pay link", placeholder: "https://…" },
    ],
  },
  {
    kind: "overdue_5d",
    name: "Reminder — overdue 5 days",
    description: "Overdue payment nudge (+5 days).",
    fields: [
      { key: "1", label: "First name", fromFirstName: true },
      { key: "2", label: "Due date", placeholder: "15 July 2026" },
      { key: "3", label: "Amount due", placeholder: "EC$25.00" },
      { key: "4", label: "Pay link", placeholder: "https://…" },
    ],
  },
];

export function getQuickWhatsAppTemplate(kind: string): QuickWhatsAppTemplateDef | null {
  return QUICK_WHATSAPP_TEMPLATES.find((t) => t.kind === kind) ?? null;
}

export function isQuickWhatsAppTemplateKind(value: string): value is QuickWhatsAppTemplateKind {
  return QUICK_WHATSAPP_TEMPLATES.some((t) => t.kind === value);
}
