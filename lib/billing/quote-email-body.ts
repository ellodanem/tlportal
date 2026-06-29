function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatQuoteDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-029", { day: "2-digit", month: "short", year: "numeric" });
}

export function defaultQuoteEmailSubject(quoteNumber: string): string {
  return `Quote ${quoteNumber} — Track Lucia`;
}

export function defaultQuoteEmailBody(input: {
  greetingName: string;
  quoteNumber: string;
  validUntilYmd: string;
}): { text: string; html: string } {
  const validLabel = formatQuoteDateLabel(input.validUntilYmd);
  const greeting = input.greetingName.trim() || "there";

  const text = `Hello ${greeting},

Please find attached our quote ${input.quoteNumber}, valid until ${validLabel}.

If you have questions or would like to proceed, reply to this email.

— Track Lucia`;

  const html = `<p>Hello ${escapeHtml(greeting)},</p>
<p>Please find attached our quote <strong>${escapeHtml(input.quoteNumber)}</strong>, valid until ${escapeHtml(validLabel)}.</p>
<p>If you have questions or would like to proceed, reply to this email.</p>
<p>— Track Lucia</p>`;

  return { text, html };
}

/** Turn edited plain-text body into HTML for SMTP (preserves line breaks). */
export function quoteEmailHtmlFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
}
