import { getSession } from "@/lib/auth/get-session";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import {
  resolveProposalCenterLogoPath,
  resolveProposalHeaderLogoStored,
} from "@/lib/proposals/proposal-cover-assets";
import { buildProposalCoverSamplePdfBuffer } from "@/lib/proposals/pdf";
import { getServerOriginFromEnv } from "@/lib/proposals/resolve-asset-url";

export const runtime = "nodejs";

/** Single-page PDF with fixed sample “Prepared for” copy — verifies cover (page 1) layout and logos. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = getServerOriginFromEnv();
  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(origin, resolveProposalHeaderLogoStored(brandingStored));
  const centerBrandLogo = await fetchImageAsLogo(origin, resolveProposalCenterLogoPath());

  const buf = buildProposalCoverSamplePdfBuffer({ headerLogo, centerBrandLogo });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="proposal-cover-sample.pdf"',
    },
  });
}
