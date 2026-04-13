import "server-only";

import type { Customer, Proposal } from "@prisma/client";

import type { ProposalForPdf } from "@/lib/proposals/pdf";

type ProposalWithRelations = Proposal & {
  lineItems: ProposalForPdf["lineItems"];
  visuals: ProposalForPdf["visuals"];
  customer: Customer | null;
};

/** Fill PDF-facing client fields from the linked Customer when proposal fields are blank. */
export function proposalForPdfWithCustomerFallback(row: ProposalWithRelations): ProposalForPdf {
  const { customer, ...rest } = row;
  const person = [customer?.firstName?.trim(), customer?.lastName?.trim()].filter(Boolean).join(" ");
  const company = customer?.company?.trim() || null;
  const labelFromCustomer = company || person || null;

  return {
    ...rest,
    clientLabel: rest.clientLabel?.trim() || labelFromCustomer,
    clientCompany: rest.clientCompany?.trim() || company,
    clientContactName: rest.clientContactName?.trim() || person || null,
    clientEmail: rest.clientEmail?.trim() || customer?.email?.trim() || null,
    clientPhone: rest.clientPhone?.trim() || customer?.phone?.trim() || null,
    clientAddress:
      rest.clientAddress?.trim() ||
      [customer?.address, customer?.city, customer?.state, customer?.postalCode, customer?.country]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(", ") ||
      null,
  };
}
