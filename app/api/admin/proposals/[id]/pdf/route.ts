import { getSession } from "@/lib/auth/get-session";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { prisma } from "@/lib/db";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import {
  resolveProposalCenterLogoPath,
  resolveProposalHeaderLogoStored,
} from "@/lib/proposals/proposal-cover-assets";
import { buildProposalPdfBuffer, type LogoImage } from "@/lib/proposals/pdf";
import { effectiveVisualImageUrlForExport } from "@/lib/proposals/proposal-static-visuals";
import { proposalForPdfWithCustomerFallback } from "@/lib/proposals/resolve-client-for-pdf";
import { resolveAssetFetchOrigin } from "@/lib/proposals/resolve-asset-url";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return new Response("Not found", { status: 404 });
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      visuals: { orderBy: { sortOrder: "asc" } },
      customer: true,
    },
  });

  if (!proposal) {
    return new Response("Not found", { status: 404 });
  }

  const origin = resolveAssetFetchOrigin(req);
  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(origin, resolveProposalHeaderLogoStored(brandingStored));
  const centerBrandLogo = await fetchImageAsLogo(origin, resolveProposalCenterLogoPath());

  const visualImages = new Map<number, LogoImage>();
  for (const v of proposal.visuals) {
    const url = effectiveVisualImageUrlForExport(v);
    if (!url) continue;
    const img = await fetchImageAsLogo(origin, url);
    if (img) {
      visualImages.set(Number(v.sortOrder), img);
    }
  }

  const forPdf = proposalForPdfWithCustomerFallback(proposal);
  const buf = buildProposalPdfBuffer(forPdf, { headerLogo, centerBrandLogo, visualImages });

  const safeName = `proposal-${id.slice(0, 8)}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
