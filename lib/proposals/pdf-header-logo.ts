import "server-only";

import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import {
  PDF_HEADER_LOGO_BOUNDS,
  prepareLogoImageForPdf,
  type PdfLogoBounds,
} from "@/lib/proposals/prepare-logo-for-pdf";
import { resolveProposalHeaderLogoStored } from "@/lib/proposals/proposal-cover-assets";
import type { LogoImage } from "@/lib/proposals/pdf";

/** Header logo for one-page billing PDFs (quotes, invoices). */
export async function loadPdfHeaderLogo(bounds: PdfLogoBounds = PDF_HEADER_LOGO_BOUNDS): Promise<LogoImage | null> {
  const brandingStored = await getBrandingLogoStored();
  const raw = await fetchImageAsLogo(null, resolveProposalHeaderLogoStored(brandingStored));
  return prepareLogoImageForPdf(raw, bounds);
}
