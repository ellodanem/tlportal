import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ProposalEditorForm,
  type CustomerOption,
  type ProposalEditorInitial,
  type ProposalEditorLine,
  type ProposalEditorVisual,
} from "@/components/admin/proposal-editor-form";
import { prisma } from "@/lib/db";
import { parseTimelineSteps } from "@/lib/proposals/visual-timeline";

function toEditorInitial(
  proposal: NonNullable<Awaited<ReturnType<typeof loadProposal>>>,
): ProposalEditorInitial {
  const lineItems: ProposalEditorLine[] = proposal.lineItems.map((li) => ({
    key: li.id,
    category: li.category,
    description: li.description,
    quantity: Number(li.quantity),
    unitLabel: li.unitLabel ?? "",
    unitPrice: Number(li.unitPrice),
  }));

  const visuals: ProposalEditorVisual[] = proposal.visuals.map((v) => {
    const parsed = parseTimelineSteps(v.timelineSteps);
    const timelineSteps =
      parsed.length > 0
        ? parsed.map((s) => ({ title: s.title, detail: s.detail }))
        : [
            { title: "Order", detail: "" },
            { title: "Install", detail: "" },
            { title: "Go live", detail: "" },
          ];
    return {
      key: v.id,
      title: v.title,
      caption: v.caption ?? "",
      imageUrl: v.imageUrl ?? "",
      placeholderHint: v.placeholderHint ?? "",
      imageAlt: v.imageAlt ?? "",
      kind: v.kind,
      layout: v.layout,
      timelineSteps,
    };
  });

  return {
    id: proposal.id,
    status: proposal.status,
    title: proposal.title,
    customerId: proposal.customerId,
    clientLabel: proposal.clientLabel,
    clientCompany: proposal.clientCompany,
    clientContactName: proposal.clientContactName,
    clientEmail: proposal.clientEmail,
    clientPhone: proposal.clientPhone,
    clientAddress: proposal.clientAddress,
    executiveSummary: proposal.executiveSummary,
    includedFeatures: proposal.includedFeatures,
    assumptionsText: proposal.assumptionsText,
    nextStepsText: proposal.nextStepsText,
    termsText: proposal.termsText,
    pricingFootnote: proposal.pricingFootnote,
    validityDays: proposal.validityDays,
    currencyCode: proposal.currencyCode,
    salesContactName: proposal.salesContactName,
    salesContactTitle: proposal.salesContactTitle,
    salesContactEmail: proposal.salesContactEmail,
    salesContactPhone: proposal.salesContactPhone,
    lineItems,
    visuals,
  };
}

function loadProposal(id: string) {
  return prisma.proposal.findUnique({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      visuals: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await loadProposal(id);
  if (!proposal) {
    notFound();
  }

  const customers = await prisma.customer.findMany({
    orderBy: [{ company: "asc" }, { lastName: "asc" }],
    select: { id: true, company: true, firstName: true, lastName: true },
  });

  const customerOptions: CustomerOption[] = customers.map((c) => {
    const company = c.company?.trim();
    const person = [c.firstName?.trim(), c.lastName?.trim()].filter(Boolean).join(" ");
    return {
      id: c.id,
      label: company || person || c.id.slice(0, 8),
    };
  });

  const initial = toEditorInitial(proposal);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/proposals" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Proposals
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit proposal</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Save changes, then download the PDF. Client fields left blank can fall back to the linked customer on export.
        </p>
      </div>

      <ProposalEditorForm key={proposal.updatedAt.toISOString()} initial={initial} customerOptions={customerOptions} />
    </div>
  );
}
