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

export function defaultInvoiceEmailBody(input: {
  greetingName: string;
  invoiceNumber: string;
  dueDate: Date | null;
  amountDue: number;
  currency: string;
  payUrl: string | null;
}): { text: string; html: string } {
  const greeting = input.greetingName.trim() || "there";
  const dueLabel = formatDateLabel(input.dueDate);
  const amount = input.amountDue.toLocaleString("en-029", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountStr = input.currency.toUpperCase() === "XCD" ? `EC$${amount}` : `${input.currency} ${amount}`;

  const payLine = input.payUrl
    ? `\nView invoice and payment details: ${input.payUrl}\n`
    : "";

  const text = `Hello ${greeting},

Please find attached invoice ${input.invoiceNumber}${input.dueDate ? `, due ${dueLabel}` : ""}.
Amount due: ${amountStr}.${payLine}
If you have questions, reply to this email.

— Track Lucia`;

  const payHtml = input.payUrl
    ? `<p><a href="${escapeHtml(input.payUrl)}">View invoice online</a></p>`
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
