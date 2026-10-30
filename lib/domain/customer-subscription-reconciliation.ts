/**
 * Read-only analysis of how one customer's canonical subscriptions are
 * structured. It never mutates anything and never recommends merging records
 * solely because renewal dates coincide: a consolidation candidate must share
 * cadence, currency, collection method, renewal date and provider status, and
 * every blocker (paid invoices, open schedules, provider links) is surfaced so
 * a human can authorise or reject the movement explicitly.
 */

export type ReconciliationRate = {
  amount: string;
  currency: string;
  billingIntervalMonths: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

export type ReconciliationItem = {
  id: string;
  label: string | null;
  status: string;
  billingEffectiveFrom: string | null;
  billingEffectiveUntil: string | null;
  serviceActivatedDate: string | null;
  currentRate: ReconciliationRate | null;
  openDeviceAssignments: number;
};

export type ReconciliationSubscription = {
  id: string;
  name: string | null;
  controlMode: "legacy" | "shadow" | "canonical";
  lifecycleStatus: string | null;
  collectionMethod: string | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  billingAnchorDate: string | null;
  nextBillingDate: string | null;
  openRecurringSchedules: number;
  openStripeProviderLinks: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  hasMigrationLedger: boolean;
  items: ReconciliationItem[];
};

export type ReconciliationCadenceGroup = {
  billingIntervalMonths: number | null;
  label: string;
  subscriptionIds: string[];
  serviceCount: number;
  /** Per-currency cycle totals. Different cadences are never summed together. */
  cycleTotals: Record<string, string>;
};

export type ConsolidationCandidate = {
  subscriptionIds: [string, string];
  reason: string;
  blockers: string[];
};

export type CustomerReconciliationReport = {
  subscriptionCount: number;
  cadenceGroups: ReconciliationCadenceGroup[];
  consolidationCandidates: ConsolidationCandidate[];
  warnings: string[];
};

function cadenceLabel(months: number | null): string {
  if (months === 1) return "Monthly";
  if (months === 3) return "Quarterly";
  if (months === 4) return "Every 4 months";
  if (months === 6) return "Every 6 months";
  if (months === 12) return "Annual";
  return "Unclassified cadence";
}

function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
}

function formatCents(value: bigint): string {
  const whole = value / BigInt(100);
  const fraction = (value % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

function currentItems(subscription: ReconciliationSubscription): ReconciliationItem[] {
  return subscription.items.filter((item) => !["ended", "canceled"].includes(item.status));
}

export function analyzeCustomerSubscriptions(
  subscriptions: ReconciliationSubscription[],
): CustomerReconciliationReport {
  const warnings: string[] = [];
  const groups = new Map<number | null, ReconciliationSubscription[]>();
  for (const subscription of subscriptions) {
    const key = subscription.billingIntervalMonths;
    groups.set(key, [...(groups.get(key) ?? []), subscription]);
  }

  const cadenceGroups: ReconciliationCadenceGroup[] = [...groups.entries()]
    .sort(([left], [right]) => (right ?? 0) - (left ?? 0))
    .map(([months, members]) => {
      const totals = new Map<string, bigint>();
      let serviceCount = 0;
      for (const member of members) {
        if (member.lifecycleStatus === "ended" || member.lifecycleStatus === "canceled") continue;
        for (const item of currentItems(member)) {
          serviceCount += 1;
          if (!item.currentRate) {
            warnings.push(`Service "${item.label ?? item.id}" on ${member.id} has no effective rate; it is excluded from totals.`);
            continue;
          }
          totals.set(
            item.currentRate.currency,
            (totals.get(item.currentRate.currency) ?? BigInt(0)) + cents(item.currentRate.amount),
          );
        }
      }
      return {
        billingIntervalMonths: months,
        label: cadenceLabel(months),
        subscriptionIds: members.map((member) => member.id),
        serviceCount,
        cycleTotals: Object.fromEntries([...totals.entries()].map(([currency, total]) => [currency, formatCents(total)])),
      };
    });

  const candidates: ConsolidationCandidate[] = [];
  const live = subscriptions.filter((subscription) =>
    subscription.controlMode !== "legacy" && !["ended", "canceled"].includes(subscription.lifecycleStatus ?? ""));
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const left = live[i];
      const right = live[j];
      const sameTerms = left.billingIntervalMonths != null
        && left.billingIntervalMonths === right.billingIntervalMonths
        && left.currency === right.currency
        && left.collectionMethod === right.collectionMethod
        && left.nextBillingDate != null
        && left.nextBillingDate === right.nextBillingDate;
      if (!sameTerms) continue;
      const blockers: string[] = [];
      if (left.controlMode !== "canonical" || right.controlMode !== "canonical") {
        blockers.push("At least one record is a migration shadow; shadows keep source authority and must not be merged.");
      }
      if (left.openRecurringSchedules + right.openRecurringSchedules > 0) {
        blockers.push("An open recurring invoice schedule exists; merging would require retiring or rewriting a live schedule.");
      }
      if (left.openStripeProviderLinks + right.openStripeProviderLinks > 0) {
        blockers.push("An open Stripe provider link exists; provider quantities and prices must be reconciled first.");
      }
      if (left.paidInvoiceCount + right.paidInvoiceCount > 0) {
        blockers.push("Paid invoices are attributed to these agreements; their attribution must remain immutable.");
      }
      if (left.hasMigrationLedger || right.hasMigrationLedger) {
        blockers.push("A canonical migration ledger points at one of these records.");
      }
      candidates.push({
        subscriptionIds: [left.id, right.id],
        reason: "Same cadence, currency, collection method and renewal date. Matching dates alone do not authorise a merge.",
        blockers,
      });
    }
  }

  return {
    subscriptionCount: subscriptions.length,
    cadenceGroups,
    consolidationCandidates: candidates,
    warnings,
  };
}

export function reconciliationMarkdown(
  customerLabel: string,
  subscriptions: ReconciliationSubscription[],
  report: CustomerReconciliationReport,
): string {
  const lines: string[] = [];
  lines.push(`# Read-only subscription reconciliation — ${customerLabel}`);
  lines.push("");
  lines.push(`Subscriptions (all control modes): **${report.subscriptionCount}**`);
  lines.push("");
  for (const subscription of subscriptions) {
    lines.push(`## ${subscription.name ?? "Unnamed"} (${subscription.id})`);
    lines.push(`- Control: ${subscription.controlMode}; lifecycle: ${subscription.lifecycleStatus ?? "n/a"}; collection: ${subscription.collectionMethod ?? "n/a"}`);
    lines.push(`- Cadence: ${cadenceLabel(subscription.billingIntervalMonths)}; currency: ${subscription.currency ?? "n/a"}; anchor: ${subscription.billingAnchorDate ?? "n/a"}; next billing: ${subscription.nextBillingDate ?? "n/a"}`);
    lines.push(`- Open recurring schedules: ${subscription.openRecurringSchedules}; open Stripe links: ${subscription.openStripeProviderLinks}; invoices: ${subscription.invoiceCount} (${subscription.paidInvoiceCount} paid); migration ledger: ${subscription.hasMigrationLedger ? "yes" : "no"}`);
    for (const item of subscription.items) {
      const rate = item.currentRate
        ? `${item.currentRate.currency} ${item.currentRate.amount} / ${cadenceLabel(item.currentRate.billingIntervalMonths).toLowerCase()} (from ${item.currentRate.effectiveFrom})`
        : "no effective rate";
      lines.push(`  - Service "${item.label ?? item.id}" — ${item.status}; ${rate}; activated ${item.serviceActivatedDate ?? "n/a"}; billing from ${item.billingEffectiveFrom ?? "n/a"}; open devices ${item.openDeviceAssignments}`);
    }
    lines.push("");
  }
  lines.push("## Cadence groups (never summed across cadences)");
  for (const group of report.cadenceGroups) {
    const totals = Object.entries(group.cycleTotals).map(([currency, total]) => `${currency} ${total}`).join(", ") || "n/a";
    lines.push(`- ${group.label}: ${group.subscriptionIds.length} subscription(s), ${group.serviceCount} current service(s), per-cycle total ${totals}`);
  }
  lines.push("");
  lines.push("## Consolidation candidates (suggestion only — nothing was changed)");
  if (!report.consolidationCandidates.length) lines.push("- None.");
  for (const candidate of report.consolidationCandidates) {
    lines.push(`- ${candidate.subscriptionIds.join(" + ")}: ${candidate.reason}`);
    for (const blocker of candidate.blockers) lines.push(`  - BLOCKER: ${blocker}`);
    if (!candidate.blockers.length) lines.push("  - No automatic blockers; still requires explicit owner authorisation.");
  }
  if (report.warnings.length) {
    lines.push("");
    lines.push("## Warnings");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}
