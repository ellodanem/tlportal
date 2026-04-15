import type { Prisma } from "@prisma/client";

/** Matches the approved proposal template; `---` separates terms subsections for PDF/DOCX rendering. */
const DEFAULT_TERMS = `Terms & conditions
• Installations are scheduled with your operations team. Typical on-site work is about 20–45 minutes per vehicle when the vehicle is accessible.
• Standard installations use discreet placement to reduce tampering risk. Non-standard vehicles or retrofits may need a separate scope.
• Remote configuration and monitoring reduce unnecessary field visits for routine troubleshooting.

---

Warranty (hardware)
• The tracking device carries a limited warranty against defects in materials and workmanship under normal use, for the period stated on your order or product documentation.
• Warranty does not cover batteries, antennas, cables, or damage from misuse, accident, flood, fire, unauthorized service, or faulty third-party installation.

---

Payment
• Subscription charges are generally billed in accordance with the desired billing period selected (e.g. monthly or annual).
• Hardware may be invoiced on order confirmation or prior to shipment/delivery as agreed.
• Travel, lodging, or after-hours work outside the agreed service footprint may be invoiced separately.

---

Delivery and go-live
• Hardware shipment or staging dates depend on stock and import lead times; we will confirm a window after order acceptance.
• Service activation (SIM / data / portal access) is coordinated with installation or as soon as devices report in.

---

Service level (support)
• Business-hours support response targets are communicated in your service agreement. Critical safety or security incidents may be escalated according to that agreement.
• On-site response outside the standard area may require additional time and travel.

---

Limitations
• Track Lucia is not responsible for indirect, consequential, or economic loss, including lost profits or business interruption, except where such limitation is prohibited by law.
• Map, cellular, and third-party platform outages outside our control may affect real-time views without constituting a breach of this proposal.

---

Liability
• Liability is limited to fees paid for the specific service giving rise to the claim during the twelve (12) months before the event, except for liability that cannot be limited by law.
• This proposal is an offer only; a signed order or master agreement governs the commercial relationship.`;

const DEFAULT_EXEC_SUMMARY = `We are pleased to offer a Track Lucia fleet visibility package: live map tracking, geo-fence and movement-related alerts, trip history, and multi-vehicle administration — all using dedicated mobile data so vehicles are not dependent on customer Wi-Fi. The commercial summary below lists typical hardware, subscription, installation, and optional maintenance lines; quantities and travel can be adjusted before you move to formal estimate and invoice.`;

const DEFAULT_FEATURES = `Live tracking on map with multi-vehicle dashboard
Geo-fence, movement, and power-disconnect style alerts
Trip history and route playback for accountability
User management, roles, and operational reports
Discreet installation to reduce tampering risk
Dedicated cellular data path (devices do not rely on in-vehicle Wi-Fi)
Optional FleetGuardian after-hours monitoring for critical events`;

const DEFAULT_ASSUMPTIONS = `Pricing assumes the fleet size, territory, and installation model discussed with your team. Duties, taxes, regulatory levies, or carrier surcharges may apply and will be shown on invoice unless explicitly included here.`;

const DEFAULT_NEXT_STEPS = `• Confirm vehicle count, installation windows, and billing term.
• Accept this proposal within the validity window below.
• We will issue estimate and invoice through our billing workflow and schedule deployment.`;

const DEFAULT_PRICING_FOOTNOTE = `* Line totals are indicative only until quantities and taxes are finalized on invoice.
** Government taxes, regulatory fees, or carrier pass-through charges may apply in addition to the amounts above.
*** Travel, lodging, or premium after-hours work outside the agreed service area may be quoted separately.
{Include the ability to include terms regarding deposit and payment.}`;

export function buildDefaultProposalNestedCreate(
  createdById: string | null,
): Prisma.ProposalCreateInput {
  return {
    title: "Vehicle Fleet Tracking Solution",
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
          description:
            "Track Lucia – Wired GPS Device\n• Supply, Configuration, per vehicle",
          quantity: 1,
          unitLabel: "per vehicle",
          unitPrice: 0,
        },
        {
          sortOrder: 1,
          category: "subscription",
          description:
            "Software Subscription Charges (per-vehicle/per-unit)\n• Monthly (Payable in Advance)\n(Including Activated SIM, GPRS, Reports, Web Hosting, Data Backup & Storage, Google Enterprise Maps, Fixed Alerts)",
          quantity: 1,
          unitLabel: "per vehicle",
          unitPrice: 0,
        },
        {
          sortOrder: 2,
          category: "installation",
          description: "Fleet installation — standard on-site visit (per vehicle)",
          quantity: 1,
          unitLabel: "per vehicle",
          unitPrice: 0,
        },
        {
          sortOrder: 3,
          category: "installation",
          description: "Travel / extended territory installation surcharge (if applicable)",
          quantity: 0,
          unitLabel: "per vehicle",
          unitPrice: 0,
        },
      ],
    },
    visuals: {
      create: [
        {
          sortOrder: 0,
          kind: "media",
          layout: "full_width",
          title: "Platform at a glance",
          caption: "Single dashboard for multiple vehicles — ideal for rental and mixed fleets.",
          placeholderHint: "[Screenshot: live map / fleet dashboard — multi-vehicle view]",
          imageUrl: null,
          imageAlt: "Fleet map showing multiple vehicles on one dashboard",
        },
        {
          sortOrder: 1,
          kind: "media",
          layout: "full_width",
          title: "Alerts and notifications",
          caption: "Geofence, movement, and power-disconnect alerts so you see critical events quickly.",
          placeholderHint: "[Screenshot: alert or notification — geofence or power disconnect]",
          imageUrl: null,
          imageAlt: "Sample in-app or SMS alert for vehicle event",
        },
        {
          sortOrder: 2,
          kind: "media",
          layout: "full_width",
          title: "Install",
          caption: "20–45 min / vehicle",
          placeholderHint:
            "[Photo: discreet install example (non-identifying vehicle) — or diagram: device + vehicle power]",
          imageUrl: null,
          imageAlt: "Vehicle tracker installation or power connection diagram",
        },
        {
          sortOrder: 3,
          kind: "media",
          layout: "full_width",
          title: "Trip history and accountability",
          caption: "Replay where vehicles went and when — useful for rentals and dispute resolution.",
          placeholderHint: "[Screenshot: route playback or trip history]",
          imageUrl: null,
          imageAlt: "Trip history or route playback screen",
        },
        {
          sortOrder: 4,
          kind: "media",
          layout: "full_width",
          title: "Installation and hardware",
          caption:
            "Discreet install on vehicle power; devices use their own mobile data — no reliance on in-vehicle Wi-Fi.",
          placeholderHint:
            "[Photo: discreet install example (non-identifying vehicle) — or diagram: device + vehicle power]",
          imageUrl: null,
          imageAlt: "Vehicle tracker installation or power connection diagram",
        },
        {
          sortOrder: 5,
          kind: "timeline",
          layout: "full_width",
          title: "Typical rollout timeline",
          caption: "Rough durations for planning; your project manager will confirm dates after order.",
          placeholderHint: null,
          imageUrl: null,
          imageAlt: null,
          timelineSteps: [
            { title: "Order", detail: "1–3 business days" },
            { title: "Install", detail: "20–45 min / vehicle" },
            { title: "Go live", detail: "Same day when online" },
          ],
        },
      ],
    },
  };
}
