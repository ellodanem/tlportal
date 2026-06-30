import "server-only";

/** True when TL native billing is the default product path (Phase 7 cutover). */
export function isNativeBillingPrimary(): boolean {
  const flag = process.env.NATIVE_BILLING_PRIMARY?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

/**
 * Show legacy Invoiless admin UI (sidebar link, customer sync, live API list).
 * Off by default once native billing is primary unless INVOILESS_LEGACY_UI is set.
 */
export function isInvoilessLegacyUiEnabled(): boolean {
  if (!process.env.INVOILESS_API_KEY?.trim()) return false;
  const flag = process.env.INVOILESS_LEGACY_UI?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return !isNativeBillingPrimary();
}

/** Customer-facing invoice number — TL-INV for native rows, IL-{n} for imports. */
export function displayInvoiceNumber(row: {
  number: string | null;
  legacyInvoiceNumber?: string | null;
}): string {
  if (row.number?.trim()) return row.number.trim();
  const legacy = row.legacyInvoiceNumber?.trim();
  if (legacy) return `IL-${legacy}`;
  return "—";
}
