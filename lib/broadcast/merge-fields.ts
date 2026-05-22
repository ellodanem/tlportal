/** Merge tokens for broadcast subject/body (plain text; HTML derived on send). */

export const BROADCAST_MERGE_FIELDS = [
  { key: "customer_name", label: "Customer name", token: "{{customer_name}}" },
  { key: "first_name", label: "First name", token: "{{first_name}}" },
  { key: "company", label: "Company", token: "{{company}}" },
  { key: "support_email", label: "Support email", token: "{{support_email}}" },
  { key: "portal_url", label: "Portal URL", token: "{{portal_url}}" },
  { key: "incident_title", label: "Incident title", token: "{{incident_title}}" },
  { key: "incident_status", label: "Incident status", token: "{{incident_status}}" },
  { key: "eta", label: "ETA / next update", token: "{{eta}}" },
] as const;

export type BroadcastMergeKey = (typeof BROADCAST_MERGE_FIELDS)[number]["key"];

export type BroadcastMergeValues = Record<BroadcastMergeKey, string>;

/** Static sample values for admin preview and test sends. */
export const BROADCAST_MERGE_SAMPLE: BroadcastMergeValues = {
  customer_name: "Acme Fleet Ltd",
  first_name: "Jane",
  company: "Acme Fleet Ltd",
  support_email: "support@tracklucia.com",
  portal_url: "https://tracklucia.com",
  incident_title: "GPS tracking service",
  incident_status: "Investigating",
  eta: "We expect an update within 2 hours.",
};

const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function applyBroadcastMergeFields(text: string, values: Partial<BroadcastMergeValues>): string {
  return text.replace(TOKEN_RE, (_, key: string) => {
    const v = values[key as BroadcastMergeKey];
    return v !== undefined && v !== "" ? v : "";
  });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → simple HTML (paragraphs + line breaks), for outgoing mail. */
export function broadcastTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "<p></p>";
  const blocks = trimmed.split(/\n\n+/);
  return blocks
    .map((block) => {
      const inner = escapeHtml(block).replace(/\n/g, "<br>");
      return `<p>${inner}</p>`;
    })
    .join("\n");
}

export function broadcastBodyToEmailParts(
  subject: string,
  bodyText: string,
  merge: Partial<BroadcastMergeValues>,
): { subject: string; text: string; html: string } {
  const resolvedSubject = applyBroadcastMergeFields(subject, merge).trim();
  const resolvedBody = applyBroadcastMergeFields(bodyText, merge).trim();
  const footer =
    "\n\n— Track Lucia\nOperational notice for your Track Lucia service. Reply to this email if you need help.";
  const text = `${resolvedBody}${footer}`;
  const htmlBody = broadcastTextToHtml(resolvedBody);
  const htmlFooter = `<p style="font-size:0.9em;color:#555;margin-top:1.5em">— Track Lucia<br>Operational notice for your Track Lucia service. Reply to this email if you need help.</p>`;
  return {
    subject: resolvedSubject,
    text,
    html: `${htmlBody}\n${htmlFooter}`,
  };
}
