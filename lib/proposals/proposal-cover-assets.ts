import "server-only";

/**
 * Cover page uses two logos: Ellodane (header, top-left) and Track Lucia mark (center, under title).
 * - `PROPOSAL_PDF_HEADER_LOGO` — optional path/URL (same rules as branding logo). If unset, the admin branding logo is used.
 * - `PROPOSAL_PDF_CENTER_LOGO` — optional path/URL for the centered product mark. If unset, `/proposals/track-lucia-cover.png` is tried.
 */

export function resolveProposalHeaderLogoStored(brandingLogoStored: string | null): string | null {
  const fromEnv = process.env.PROPOSAL_PDF_HEADER_LOGO?.trim();
  if (fromEnv) return fromEnv;
  return brandingLogoStored;
}

export function resolveProposalCenterLogoPath(): string {
  const fromEnv = process.env.PROPOSAL_PDF_CENTER_LOGO?.trim();
  if (fromEnv) return fromEnv;
  return "/proposals/track-lucia-cover.png";
}
