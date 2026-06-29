import "server-only";

import type { QuoteRequestPayload } from "@/lib/billing/quote-payload";
import { buildQuotePdfFromPayload, type BuiltQuotePdf } from "@/lib/billing/quote-build";
import { prisma } from "@/lib/db";

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function quoteToPayload(quote: {
  number: string | null;
  customerId: string | null;
  billToLines: string[];
  issueDate: Date;
  validUntil: Date | null;
  currency: string;
  notes: string | null;
  lineItems: { description: string; quantity: { toString(): string }; unitPrice: { toString(): string } }[];
}): QuoteRequestPayload {
  return {
    customerId: quote.customerId,
    billToLines: quote.billToLines.length ? quote.billToLines : null,
    quoteNumber: quote.number ?? "Draft",
    quoteDate: formatYmd(quote.issueDate),
    validUntil: formatYmd(quote.validUntil ?? quote.issueDate),
    currency: quote.currency,
    notes: quote.notes,
    lineItems: quote.lineItems.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    })),
  };
}

export async function buildQuotePdfFromQuoteId(quoteId: string): Promise<BuiltQuotePdf | { error: string }> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) {
    return { error: "Quote not found." };
  }
  if (!quote.lineItems.length) {
    return { error: "Quote has no line items." };
  }
  return buildQuotePdfFromPayload(quoteToPayload(quote));
}
