import { formatMoney } from "@/lib/domain/native-billing";

export type OutstandingInvoiceReminderCandidate = {
  selectionKey: string;
  source: "native_invoice" | "stripe_invoice";
  sourceId: string;
  label: string;
  reference: string | null;
  amountLabel: string;
  dueDateLabel: string | null;
  paymentUrl: string;
  status: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatOutstandingInvoiceDueDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-029", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildOutstandingInvoiceReminderEmailSubject(count: number): string {
  return count === 1
    ? "Outstanding invoice for your Track Lucia service"
    : "Outstanding invoices for your Track Lucia service";
}

export function buildOutstandingInvoiceReminderEmailText(input: {
  greetingName: string;
  items: OutstandingInvoiceReminderCandidate[];
}): string {
  const greeting = input.greetingName.trim() || "there";
  const intro =
    input.items.length === 1
      ? "This is a friendly reminder that the following invoice for your Track Lucia service is still outstanding:"
      : "This is a friendly reminder that the following invoices for your Track Lucia service are still outstanding:";

  const lines = input.items.flatMap((item, index) => {
    const details = [item.amountLabel];
    if (item.dueDateLabel) details.push(`Due ${item.dueDateLabel}`);
    const ref = item.reference?.trim();
    const firstLine = `• ${item.label}${ref ? ` (${ref})` : ""} — ${details.join(" — ")}`;
    return [firstLine, `  Payment link: ${item.paymentUrl}`, ...(index < input.items.length - 1 ? [""] : [])];
  });

  return `Good day ${greeting},

${intro}

${lines.join("\n")}

To avoid any interruption of service, we would appreciate payment at your earliest convenience.

If you have already settled any of the above, please disregard this email. If you have any questions, just reply and we will be happy to help.

Thank you,
Track Lucia`;
}

export function buildOutstandingInvoiceReminderEmailHtml(input: {
  greetingName: string;
  items: OutstandingInvoiceReminderCandidate[];
}): string {
  const greeting = escapeHtml(input.greetingName.trim() || "there");
  const intro =
    input.items.length === 1
      ? "This is a friendly reminder that the following invoice for your Track Lucia service is still outstanding:"
      : "This is a friendly reminder that the following invoices for your Track Lucia service are still outstanding:";

  const listHtml = input.items
    .map((item) => {
      const detailParts = [escapeHtml(item.amountLabel)];
      if (item.dueDateLabel) detailParts.push(`Due ${escapeHtml(item.dueDateLabel)}`);
      const ref = item.reference?.trim();
      return `<li><strong>${escapeHtml(item.label)}${ref ? ` (${escapeHtml(ref)})` : ""}</strong> — ${detailParts.join(" — ")}<br /><a href="${escapeHtml(item.paymentUrl)}">Payment link</a></li>`;
    })
    .join("");

  return `<p>Good day ${greeting},</p>
<p>${escapeHtml(intro)}</p>
<ul>${listHtml}</ul>
<p>To avoid any interruption of service, we would appreciate payment at your earliest convenience.</p>
<p>If you have already settled any of the above, please disregard this email. If you have any questions, just reply and we will be happy to help.</p>
<p>Thank you,<br />Track Lucia</p>`;
}

export function buildOutstandingInvoiceReminderWhatsAppLines(
  items: OutstandingInvoiceReminderCandidate[],
): string {
  return items
    .map((item) => {
      const ref = item.reference?.trim();
      return `• ${item.label}${ref ? ` (${ref})` : ""} - Payment link: ${item.paymentUrl}`;
    })
    .join("\n");
}

export function buildOutstandingInvoiceReminderWhatsAppText(input: {
  greetingName: string;
  items: OutstandingInvoiceReminderCandidate[];
}): string {
  const greeting = input.greetingName.trim() || "there";
  const intro =
    input.items.length === 1
      ? "Just a friendly reminder that the following Track Lucia invoice is still outstanding:"
      : "Just a friendly reminder that the following Track Lucia invoices are still outstanding:";

  return `Good day ${greeting},

${intro}

${buildOutstandingInvoiceReminderWhatsAppLines(input.items)}

To avoid any interruption of service, please settle ${input.items.length === 1 ? "it" : "them"} at your earliest convenience.

If you already made payment, please disregard this message. If you need any clarification, just reply here.

Thank you,
Track Lucia

Note: This is a system-generated message.`;
}

export function formatOutstandingInvoiceAmount(amount: number, currency = "XCD"): string {
  return formatMoney(amount, currency);
}
