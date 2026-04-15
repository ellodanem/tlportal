import { getSession } from "@/lib/auth/get-session";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { prisma } from "@/lib/db";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import {
  buildProposalCoverPreviewPdfBuffer,
  buildProposalCoverSamplePdfBuffer,
} from "@/lib/proposals/pdf";
import {
  resolveProposalCenterLogoPath,
  resolveProposalHeaderLogoStored,
} from "@/lib/proposals/proposal-cover-assets";
import { proposalForPdfWithCustomerFallback } from "@/lib/proposals/resolve-client-for-pdf";
import { resolveAssetFetchOrigin } from "@/lib/proposals/resolve-asset-url";

export const runtime = "nodejs";

/**
 * Page 1 cover layout sample. With `?proposalId=<uuid>`, uses that proposal’s title + client fields.
 * Without the query param, uses fixed sample “Prepared for” lines (template-only).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = resolveAssetFetchOrigin(req);
  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(origin, resolveProposalHeaderLogoStored(brandingStored));
  const centerBrandLogo = await fetchImageAsLogo(origin, resolveProposalCenterLogoPath());

  const proposalId = new URL(req.url).searchParams.get("proposalId")?.trim();
  if (proposalId) {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        visuals: { orderBy: { sortOrder: "asc" } },
        customer: true,
      },
    });
    if (!proposal) {
      return new Response("Not found", { status: 404 });
    }
    const forPdf = proposalForPdfWithCustomerFallback(proposal);
    const buf = buildProposalCoverPreviewPdfBuffer(forPdf, { headerLogo, centerBrandLogo });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="proposal-cover-preview.pdf"',
      },
    });
  }

  const buf = buildProposalCoverSamplePdfBuffer({ headerLogo, centerBrandLogo });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="proposal-cover-sample.pdf"',
    },
  });
}
