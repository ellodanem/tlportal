import "server-only";

/** Shown at the top of generated proposal PDFs. Override with env for deployments. */
export function getProposalIssuerBlock(): { name: string; addressLines: string[] } {
  const name = process.env.PROPOSAL_ISSUER_NAME?.trim() || "Track Lucia";
  const raw = process.env.PROPOSAL_ISSUER_ADDRESS?.trim();
  const addressLines = raw
    ? raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : ["TrackLucia.com"];
  return { name, addressLines };
}
