import "server-only";

/**
 * Static copy for proposal PDF/DOCX — matches the approved template verbatim.
 * Only proposal fields (client, line items, money, images, contact, etc.) are substituted.
 */

export const PROPOSAL_TEMPLATE = {
  headerLine1: "Ellodane Enterprises",
  headerLine2:
    "Bois D\u2019Orange Castries | + (758) 723-9209 | tracklucia758@gmail.com",

  proposalForLabel: "Proposal for",
  defaultSubject: "Vehicle Fleet Tracking Solution",
  preparedForLabel: "Prepared for",

  overviewHeading: "Overview",
  solutionPricingHeading: "Solution pricing",

  tableHeadCol1: "Product / Service details",
  tableHeadCol2: "QTY",

  applicationFeatureSetHeading: "Application Feature Set: -",

  installationSectionTitle: "2. Installation (Per Vehicle / One Time)",
  installationSectionSubtitle: "Travel Installation: Wiring and other charges included",

  assumptionsHeading: "Assumptions",
  nextStepsHeading: "Next Steps",
  termsMainHeading: "Terms & conditions",
  validityHeading: "Validity of proposal",
  designatedContactHeading: "Designated contact",

  /** Validity body: only {{days}} and fixed Track Lucia wording per template. */
  validityBodyTemplate:
    "This proposal is valid for {{days}} days from the date of issue unless withdrawn earlier. Track Lucia reserves the right to adjust pricing if costs or regulations change before acceptance.",

  designatedContactRows: [
    { label: "Contact Person", valueKey: "name" as const },
    { label: "Designation", valueKey: "title" as const },
    { label: "Telephone", valueKey: "phone" as const },
    { label: "Email", valueKey: "email" as const },
  ],
} as const;

export function formatValidityBody(days: number): string {
  return PROPOSAL_TEMPLATE.validityBodyTemplate.replace("{{days}}", String(days));
}

export function pricingIntroLine(currency: string): string {
  return `Amounts in ${currency} unless noted. Per-unit pricing; extend quantities in the table as needed.`;
}

export function tableHeadCol3(currency: string): string {
  return `Price\n(${currency}) Total`;
}

export function footerPageText(page: number, total: number): string {
  return `-- ${page} of ${total} --`;
}
