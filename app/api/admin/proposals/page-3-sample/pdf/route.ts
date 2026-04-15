import { getSession } from "@/lib/auth/get-session";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { prisma } from "@/lib/db";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import {
  buildProposalPage3PreviewPdfBuffer,
  buildProposalPage3SamplePdfBuffer,
  type LogoImage,
} from "@/lib/proposals/pdf";
import { effectiveVisualImageUrlForExport } from "@/lib/proposals/proposal-static-visuals";
import { mergePage3TemplateVisualsWithSaved } from "@/lib/proposals/page3-sample-proposal";
import { resolveProposalHeaderLogoStored } from "@/lib/proposals/proposal-cover-assets";
import { proposalForPdfWithCustomerFallback } from "@/lib/proposals/resolve-client-for-pdf";
import { resolveAssetFetchOrigin } from "@/lib/proposals/resolve-asset-url";

export const runtime = "nodejs";

/**
 * Visual section after pricing (first four default-template blocks). With `?proposalId=<uuid>`, layout follows the
 * **current** default template; images/captions are merged from the saved proposal by **section title** (so old
 * blocks like FleetGuardian disappear without re-saving). Without `proposalId`, template placeholders only.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = resolveAssetFetchOrigin(req);
  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(origin, resolveProposalHeaderLogoStored(brandingStored));

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
    const mergedVisuals = mergePage3TemplateVisualsWithSaved(forPdf);
    const visualImages = new Map<number, LogoImage>();
    for (const v of mergedVisuals) {
      const url = effectiveVisualImageUrlForExport(v);
      if (!url) continue;
      const img = await fetchImageAsLogo(origin, url);
      if (img) {
        visualImages.set(Number(v.sortOrder), img);
      }
    }
    const buf = buildProposalPage3PreviewPdfBuffer({ ...forPdf, visuals: mergedVisuals }, headerLogo, visualImages);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="proposal-page-3-preview.pdf"',
      },
    });
  }

  const buf = buildProposalPage3SamplePdfBuffer(headerLogo);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="proposal-page-3-sample.pdf"',
    },
  });
}
