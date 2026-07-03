function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateLabel(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-029", { day: "2-digit", month: "short", year: "numeric" });
}

export function defaultInvoiceEmailSubject(invoiceNumber: string): string {
  return `Invoice ${invoiceNumber} — Track Lucia`;
}

/** Shown in admin preview before finalize; replaced with TL-INV-{n} on send. */
export const INVOICE_NUMBER_EMAIL_PLACEHOLDER = "TL-INV-…";

/** Swap preview placeholders for the finalized invoice number before delivery. */
export function applyFinalInvoiceNumberToEmailContent(
  subject: string,
  bodyText: string,
  invoiceNumber: string,
): { subject: string; bodyText: string } {
  const placeholders = [INVOICE_NUMBER_EMAIL_PLACEHOLDER, "Draft", "draft"];
  let nextSubject = subject;
  let nextBody = bodyText;
  for (const placeholder of placeholders) {
    nextSubject = nextSubject.split(placeholder).join(invoiceNumber);
    nextBody = nextBody.split(placeholder).join(invoiceNumber);
  }
  if (nextSubject === defaultInvoiceEmailSubject("Draft")) {
    nextSubject = defaultInvoiceEmailSubject(invoiceNumber);
  }
  return { subject: nextSubject, bodyText: nextBody };
}

export function defaultInvoiceEmailBody(input: {
  greetingName: string;
  invoiceNumber: string;
  dueDate: Date | null;
  amountDue: number;
  currency: string;
  payUrl: string | null;
  allowOnlinePayment?: boolean;
}): { text: string; html: string } {
  const greeting = input.greetingName.trim() || "there";
  const dueLabel = formatDateLabel(input.dueDate);
  const amount = input.amountDue.toLocaleString("en-029", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountStr = input.currency.toUpperCase() === "XCD" ? `EC$${amount}` : `${input.currency} ${amount}`;

  const payLine = input.payUrl
    ? input.allowOnlinePayment
      ? `\nView and pay online: ${input.payUrl}\n`
      : `\nView invoice and payment details: ${input.payUrl}\n`
    : "";

  const text = `Hello ${greeting},

Please find attached invoice ${input.invoiceNumber}${input.dueDate ? `, due ${dueLabel}` : ""}.
Amount due: ${amountStr}.${payLine}
If you have questions, reply to this email.

— Track Lucia`;

  const payHtml = input.payUrl
    ? input.allowOnlinePayment
      ? `<p><a href="${escapeHtml(input.payUrl)}">View and pay online</a></p>`
      : `<p><a href="${escapeHtml(input.payUrl)}">View invoice online</a></p>`
    : "";

  const html = `<p>Hello ${escapeHtml(greeting)},</p>
<p>Please find attached invoice <strong>${escapeHtml(input.invoiceNumber)}</strong>${input.dueDate ? `, due ${escapeHtml(dueLabel)}` : ""}.</p>
<p>Amount due: <strong>${escapeHtml(amountStr)}</strong></p>
${payHtml}
<p>If you have questions, reply to this email.</p>
<p>— Track Lucia</p>`;

  return { text, html };
}

export function invoiceEmailHtmlFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
}
