import type { Prisma } from "@prisma/client";

const DEFAULT_TERMS = `Payment: Subscription fees are billed according to the schedule in this proposal. Hardware may be invoiced on order or delivery as agreed.

Installation: Typical on-site installation takes about 20–45 minutes per vehicle when access is available. Travel outside the standard service area may incur additional fees (quoted separately).

Warranty & support: Hardware warranty and ongoing support terms are as stated in your order or service agreement. This proposal is an offer only and does not replace a signed contract.

Liability: Except where prohibited by law, Track Lucia is not liable for indirect or consequential losses. Full terms apply in the master service or purchase agreement.`;

const DEFAULT_EXEC_SUMMARY = `This proposal outlines a Track Lucia vehicle visibility solution for your fleet — live map tracking, alerts, and trip history using dedicated mobile data (no reliance on in-vehicle Wi-Fi). Pricing below is structured for clarity; final billing may be confirmed when you move to estimate and invoice.`;

const DEFAULT_FEATURES = `Live tracking on map
Geo-fence and movement-related alerts
Trip history and route playback
Multi-vehicle dashboard
User access management and reports
Discreet installation to reduce tampering risk
Devices use their own mobile data connection (not your phone or vehicle Wi-Fi)
Optional FleetGuardian after-hours monitoring for critical alerts`;

const DEFAULT_ASSUMPTIONS = `Pricing assumes the fleet size and service area discussed verbally or by email. Taxes, regulatory fees, or customs (if any) are excluded unless stated.`;

const DEFAULT_NEXT_STEPS = `1. Confirm vehicle count and installation schedule.
2. Accept this proposal within the validity period.
3. We will follow with estimate and invoice through our billing system.`;

const DEFAULT_PRICING_FOOTNOTE = `Amounts are in the currency shown. Taxes and government fees may apply and will appear on invoice where required.`;

export function buildDefaultProposalNestedCreate(
  createdById: string | null,
): Prisma.ProposalCreateInput {
  return {
    title: "Vehicle tracking — commercial proposal",
    status: "draft",
    validityDays: 14,
    currencyCode: "XCD",
    executiveSummary: DEFAULT_EXEC_SUMMARY,
    includedFeatures: DEFAULT_FEATURES,
    assumptionsText: DEFAULT_ASSUMPTIONS,
    nextStepsText: DEFAULT_NEXT_STEPS,
    termsText: DEFAULT_TERMS,
    pricingFootnote: DEFAULT_PRICING_FOOTNOTE,
    ...(createdById ? { createdBy: { connect: { id: createdById } } } : {}),
    lineItems: {
      create: [
        {
          sortOrder: 0,
          category: "hardware",
          description: "Track Lucia GPS device (per vehicle, installed)",
          quantity: 1,
          unitLabel: "per vehicle",
          unitPrice: 0,
        },
        {
          sortOrder: 1,
          category: "subscription",
          description: "Software subscription — maps, hosting, data, alerts (annual, per vehicle)",
          quantity: 1,
          unitLabel: "per vehicle / year",
          unitPrice: 0,
        },
        {
          sortOrder: 2,
          category: "installation",
          description: "Professional installation (standard service area)",
          quantity: 1,
          unitLabel: "per vehicle",
          unitPrice: 0,
        },
      ],
    },
    visuals: {
      create: [
        {
          sortOrder: 0,
          title: "Platform at a glance",
          caption: "Single dashboard for multiple vehicles — ideal for rental and mixed fleets.",
          placeholderHint: "[Screenshot placeholder: live map / fleet overview]",
          imageUrl: null,
        },
        {
          sortOrder: 1,
          title: "Alerts and after-hours peace of mind",
          caption:
            "Geofence, movement, and power-disconnect style alerts. Optional FleetGuardian monitoring for critical events.",
          placeholderHint: "[Screenshot placeholder: sample alert or monitoring view]",
          imageUrl: null,
        },
        {
          sortOrder: 2,
          title: "Trip history and accountability",
          caption: "Review where vehicles traveled and when with route playback.",
          placeholderHint: "[Screenshot placeholder: trip history or route playback]",
          imageUrl: null,
        },
      ],
    },
  };
}
