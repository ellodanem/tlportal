import { getSession } from "@/lib/auth/get-session";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { prisma } from "@/lib/db";
import { buildProposalDocxBuffer } from "@/lib/proposals/docx";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import type { LogoImage } from "@/lib/proposals/pdf";
import { proposalForPdfWithCustomerFallback } from "@/lib/proposals/resolve-client-for-pdf";
import { getServerOriginFromEnv } from "@/lib/proposals/resolve-asset-url";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
      lineItems: true,
      visuals: true,
      customer: true,
    },
  });

  if (!proposal) {
    return new Response("Not found", { status: 404 });
  }

  const origin = getServerOriginFromEnv();
  const logoStored = await getBrandingLogoStored();
  const logo = await fetchImageAsLogo(origin, logoStored);

  const visualImages = new Map<string, LogoImage>();
  for (const v of proposal.visuals) {
    if (!v.imageUrl?.trim()) continue;
    const img = await fetchImageAsLogo(origin, v.imageUrl);
    if (img) {
      visualImages.set(v.id, img);
    }
  }

  const forPdf = proposalForPdfWithCustomerFallback(proposal);
  const buf = await buildProposalDocxBuffer(forPdf, { logo, visualImages });

  const safeName = `proposal-${id.slice(0, 8)}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
