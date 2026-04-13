import "server-only";

export type ProposalIssuerBlock = {
  /** Legal entity on contracts and proposals (e.g. Ellodane Enterprises). */
  legalName: string;
  /** Customer-facing product / service brand (e.g. Track Lucia). Shown under the legal name when set. */
  brandLine: string | null;
  addressLines: string[];
};

/**
 * Letterhead for proposal PDFs.
 * - `PROPOSAL_LEGAL_NAME` — legal business name (default: Ellodane Enterprises).
 * - `PROPOSAL_ISSUER_NAME` — legacy alias for legal name if `PROPOSAL_LEGAL_NAME` is unset.
 * - `PROPOSAL_BRAND_TAGLINE` — brand line under legal name (default: Track Lucia). Set empty or "-" to omit.
 * - `PROPOSAL_ISSUER_ADDRESS` — multiline address / contact lines.
 */
export function getProposalIssuerBlock(): ProposalIssuerBlock {
  const legalName =
    process.env.PROPOSAL_LEGAL_NAME?.trim() ||
    process.env.PROPOSAL_ISSUER_NAME?.trim() ||
    "Ellodane Enterprises";

  const brandRaw = process.env.PROPOSAL_BRAND_TAGLINE;
  let brandLine: string | null;
  if (brandRaw === undefined) {
    brandLine = "Track Lucia";
  } else {
    const t = brandRaw.trim();
    brandLine = t === "" || t === "-" ? null : t;
  }

  const raw = process.env.PROPOSAL_ISSUER_ADDRESS?.trim();
  const addressLines = raw
    ? raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : ["TrackLucia.com"];

  return { legalName, brandLine, addressLines };
}
