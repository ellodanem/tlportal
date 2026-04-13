import "server-only";

import type { Proposal, ProposalLineCategory, ProposalLineItem, ProposalVisualBlock } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import { buildDefaultProposalNestedCreate } from "@/lib/proposals/default-draft";
import type { ProposalForPdf } from "@/lib/proposals/pdf";

const SAMPLE_PROPOSAL_ID = "00000000-0000-4000-8000-0000000000p2";

/** Same Overview + pricing + footnotes as a fresh default draft — for PDF page-2 layout sample only. */
export function buildPage2SampleProposalForPdf(): ProposalForPdf {
  const nested = buildDefaultProposalNestedCreate(null);
  const now = new Date();
  const rawItems = nested.lineItems?.create;
  if (!Array.isArray(rawItems)) {
    throw new Error("buildDefaultProposalNestedCreate: expected lineItems.create array");
  }

  const lineItems: ProposalLineItem[] = rawItems.map((row, i) => {
    const category: ProposalLineCategory = row.category ?? "other";
    const q = row.quantity != null ? new Decimal(row.quantity.toString()) : new Decimal(1);
    const p = row.unitPrice != null ? new Decimal(row.unitPrice.toString()) : new Decimal(0);
    return {
      id: `00000000-0000-4000-8000-${(1000 + i).toString(16).padStart(12, "0")}`,
      proposalId: SAMPLE_PROPOSAL_ID,
      sortOrder: row.sortOrder ?? i,
      category,
      description: row.description,
      quantity: q,
      unitLabel: row.unitLabel ?? null,
      unitPrice: p,
    };
  });

  const base: Proposal = {
    id: SAMPLE_PROPOSAL_ID,
    status: nested.status ?? "draft",
    title: nested.title ?? "Vehicle Fleet Tracking Solution",
    customerId: null,
    clientLabel: null,
    clientCompany: null,
    clientContactName: null,
    clientEmail: null,
    clientPhone: null,
    clientAddress: null,
    executiveSummary: nested.executiveSummary ?? null,
    includedFeatures: nested.includedFeatures ?? null,
    assumptionsText: nested.assumptionsText ?? null,
    nextStepsText: nested.nextStepsText ?? null,
    termsText: nested.termsText ?? null,
    pricingFootnote: nested.pricingFootnote ?? null,
    currencyCode: nested.currencyCode ?? "XCD",
    validityDays: nested.validityDays ?? 14,
    salesContactName: null,
    salesContactTitle: null,
    salesContactEmail: null,
    salesContactPhone: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
  };

  const visuals: ProposalVisualBlock[] = [];

  return { ...base, lineItems, visuals };
}
