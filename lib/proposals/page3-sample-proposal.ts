import "server-only";

import type { Proposal, ProposalVisualBlock, ProposalVisualKind, ProposalVisualLayout } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { buildDefaultProposalNestedCreate } from "@/lib/proposals/default-draft";
import type { ProposalForPdf } from "@/lib/proposals/pdf";

const SAMPLE_PROPOSAL_ID_P3 = "00000000-0000-4000-8000-0000000000p3";

/**
 * Default-draft visual blocks (first section after pricing) — trimmed to fit ~one sample page:
 * platform (full) + alerts (full) + Install + Trip (sortOrder ≤ 3).
 */
export function buildPage3SampleProposalForPdf(): ProposalForPdf {
  const nested = buildDefaultProposalNestedCreate(null);
  const now = new Date();
  const rawVis = nested.visuals?.create;
  if (!Array.isArray(rawVis)) {
    throw new Error("buildDefaultProposalNestedCreate: expected visuals.create array");
  }

  const visuals: ProposalVisualBlock[] = rawVis
    .filter((v) => (v.sortOrder ?? 0) <= 3)
    .map((v, i) => {
      const kind: ProposalVisualKind = (v.kind ?? "media") as ProposalVisualKind;
      const layout: ProposalVisualLayout = (v.layout ?? "full_width") as ProposalVisualLayout;
      return {
        id: `00000000-0000-4000-8000-${(3000 + i).toString(16).padStart(12, "0")}`,
        proposalId: SAMPLE_PROPOSAL_ID_P3,
        sortOrder: v.sortOrder ?? i,
        title: v.title,
        caption: v.caption ?? null,
        imageUrl: v.imageUrl ?? null,
        placeholderHint: v.placeholderHint ?? null,
        imageAlt: v.imageAlt ?? null,
        kind,
        layout,
        timelineSteps: (v.timelineSteps ?? null) as Prisma.JsonValue,
      };
    });

  const base: Proposal = {
    id: SAMPLE_PROPOSAL_ID_P3,
    status: nested.status ?? "draft",
    title: nested.title ?? "Vehicle Fleet Tracking Solution",
    customerId: null,
    clientLabel: null,
    clientCompany: null,
    clientContactName: null,
    clientEmail: null,
    clientPhone: null,
    clientAddress: null,
    executiveSummary: null,
    includedFeatures: null,
    assumptionsText: null,
    nextStepsText: null,
    termsText: null,
    pricingFootnote: null,
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

  return { ...base, lineItems: [], visuals };
}

/**
 * Page-3 preview: always use the **current** default template’s first four visual blocks (structure + order),
 * but copy `imageUrl`, caption, and hints from the saved proposal when the section **title** matches.
 * Drops removed sections (e.g. old FleetGuardian) and adds new template sections without a DB row.
 */
export function mergePage3TemplateVisualsWithSaved(forPdf: ProposalForPdf): ProposalVisualBlock[] {
  const template = buildPage3SampleProposalForPdf();
  const byTitle = new Map<string, ProposalVisualBlock>();
  for (const v of forPdf.visuals) {
    byTitle.set(v.title.trim().toLowerCase(), v);
  }
  return template.visuals.map((t) => {
    const saved = byTitle.get(t.title.trim().toLowerCase());
    if (!saved) {
      return t;
    }
    return {
      ...t,
      imageUrl: saved.imageUrl,
      caption: saved.caption ?? t.caption,
      placeholderHint: saved.placeholderHint ?? t.placeholderHint,
      imageAlt: saved.imageAlt ?? t.imageAlt,
    };
  });
}
