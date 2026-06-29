import "server-only";

import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import type { QuoteRequestPayload } from "@/lib/billing/quote-payload";
import { buildQuotePdfBuffer } from "@/lib/billing/quote-pdf";
import { prisma } from "@/lib/db";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import { resolveProposalHeaderLogoStored } from "@/lib/proposals/proposal-cover-assets";

export type BuiltQuotePdf = {
  buffer: Buffer;
  filename: string;
  billToLines: string[];
  clientLabel: string;
};

export async function resolveQuoteBillToLines(payload: QuoteRequestPayload): Promise<
  | { billToLines: string[]; clientLabel: string }
  | { error: string }
> {
  let billToLines = payload.billToLines ?? [];

  if (!billToLines.length && payload.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: payload.customerId },
      select: {
        company: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
      },
    });
    if (!customer) {
      return { error: "Customer not found." };
    }
    billToLines = customerBillToLines(customer);
  }

  if (!billToLines.length) {
    return { error: "Choose a customer or enter a client name." };
  }

  return { billToLines, clientLabel: billToLines[0] ?? "Customer" };
}

export async function buildQuotePdfFromPayload(payload: QuoteRequestPayload): Promise<
  BuiltQuotePdf | { error: string }
> {
  const resolved = await resolveQuoteBillToLines(payload);
  if ("error" in resolved) {
    return resolved;
  }

  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(null, resolveProposalHeaderLogoStored(brandingStored));

  const buffer = buildQuotePdfBuffer({
    quoteNumber: payload.quoteNumber,
    quoteDate: new Date(`${payload.quoteDate}T12:00:00.000Z`),
    validUntil: new Date(`${payload.validUntil}T12:00:00.000Z`),
    currency: payload.currency,
    billToLines: resolved.billToLines,
    lineItems: payload.lineItems,
    notes: payload.notes,
    headerLogo,
  });

  const filename = `quote-${payload.quoteNumber.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;

  return {
    buffer,
    filename,
    billToLines: resolved.billToLines,
    clientLabel: resolved.clientLabel,
  };
}
