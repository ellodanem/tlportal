const CC_MAX = 3;

/** Cc/Bcc: comma-separated, max 3, unique, must not duplicate primary billing email. */
export function parseInvoiceEmailCcBccList(
  raw: string | null | undefined,
  primaryEmail: string | null | undefined,
): string[] | undefined {
  const primary = primaryEmail?.trim().toLowerCase();
  if (!raw?.trim()) {
    return undefined;
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of parts) {
    if (e === primary || seen.has(e)) {
      continue;
    }
    seen.add(e);
    out.push(e);
    if (out.length >= CC_MAX) {
      break;
    }
  }
  return out.length ? out : undefined;
}
