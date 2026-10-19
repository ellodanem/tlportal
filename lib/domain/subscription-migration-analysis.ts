export type MigrationReviewStatus =
  | "ready_for_review"
  | "needs_confirmation"
  | "conflict"
  | "unmapped";

export type MigrationIssue = {
  code: string;
  severity: "warning" | "decision" | "conflict";
  message: string;
  sourceIds: string[];
};

export type LegacyCustomer = {
  id: string;
  billingMode: "manual_legacy" | "stripe_subscription";
  archivedAt: string | null;
};

export type LegacySubscription = {
  id: string;
  customerId: string;
  controlMode: "legacy" | "shadow" | "canonical";
  status: string;
  planTermMonths: number;
  monthlyRateXcd: string | null;
  vehicleCount: number | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  agreedAmountPerCycle: string | null;
  currency: string | null;
  billingAnchorDate: string | null;
  nextBillingDate: string | null;
};

export type LegacyBillingAccount = {
  id: string;
  customerId: string;
  provider: "invoiless" | "stripe";
  externalCustomerId: string;
  status: string | null;
};

export type LegacyInventory = {
  deviceIds: string[];
  simCardIds: string[];
};

export type LegacyCatalogPrice = {
  id: string;
  monthlyRateXcd: string;
  durationMonths: number;
  isActive: boolean;
};

export type LegacyAssignment = {
  id: string;
  customerId: string;
  deviceId: string;
  simCardId: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  intervalMonths: number | null;
  nextDueDate: string | null;
  invoilessRecurringId: string | null;
  subscriptionItemId: string | null;
};

export type LegacyScheduleLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export type LegacyRecurringSchedule = {
  id: string;
  customerId: string | null;
  customerSubscriptionId: string | null;
  serviceAssignmentId: string | null;
  status: "active" | "paused" | "ended";
  intervalMonths: number;
  currency: string;
  nextIssueDate: string;
  lineItems: LegacyScheduleLine[];
};

export type LegacyInvoice = {
  id: string;
  customerId: string | null;
  customerSubscriptionId: string | null;
  recurringScheduleId: string | null;
  billingInvoiceId: string | null;
  status: string;
  kind: string;
  migrationClassification?: "unreviewed" | "non_subscription" | "recurring_evidence";
  currency: string;
  subtotal?: string;
  taxLabel?: string | null;
  taxRatePercent?: string | null;
  taxTotal?: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  issueDate: string;
  archivedAt: string | null;
  recurringGenerationKey: string | null;
  invoilessInvoiceId: string | null;
  lineItems?: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
};

export type LegacyBillingInvoice = {
  id: string;
  customerId: string;
  customerSubscriptionId: string | null;
  subscriptionProviderLinkId: string | null;
  provider: "invoiless" | "stripe";
  externalInvoiceId: string;
  status: string;
  kind: string;
  amountXcd: string;
  currency: string;
  stripeSubscriptionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

export type LegacyPayment = {
  id: string;
  invoiceId: string;
  customerId: string | null;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  stripePaymentIntentId: string | null;
  voidedAt: string | null;
};

export type LegacyBillingSnapshot = {
  /** v1 snapshots remain readable; live analysis now emits v2 with invoice classification. */
  schemaVersion: "phase-2a-source-v1" | "phase-2a-source-v2";
  analysisDate: string;
  customers: LegacyCustomer[];
  subscriptions: LegacySubscription[];
  billingAccounts: LegacyBillingAccount[];
  catalogPrices: LegacyCatalogPrice[];
  inventory: LegacyInventory;
  assignments: LegacyAssignment[];
  recurringSchedules: LegacyRecurringSchedule[];
  invoices: LegacyInvoice[];
  billingInvoices: LegacyBillingInvoice[];
  payments: LegacyPayment[];
};

export type ProposedSubscriptionItem = {
  proposalItemId: string;
  serviceAssignmentId: string;
  deviceId: string;
  simCardId: string | null;
  proposedCycleAmount: string | null;
  currency: string;
  pricingEvidence: "explicit_cycle_amount" | "monthly_rate" | "schedule_total_allocation" | "unresolved";
  rateClassification: "standard" | "negotiated" | "requires_confirmation";
};

export type SubscriptionMigrationProposal = {
  proposalId: string;
  customerId: string;
  sourceKind: "stripe_subscription" | "manual_schedule" | "manual_invoice" | "legacy_subscription";
  sourceId: string;
  collectionMethod: "stripe_autocharge" | "manual_invoice" | null;
  lifecycleStatus: "pending_activation" | "active" | "paused" | "canceled" | "ended";
  billingIntervalMonths: number;
  currency: string;
  billingAnchorDate: string | null;
  nextBillingDate: string | null;
  sourceQuantity: number | null;
  /**
   * A verified service count when a manual invoice records duration × aggregate
   * fleet monthly price instead of one line per service. Source quantity remains
   * the literal invoice quantity for audit purposes.
   */
  assignmentQuantity?: number | null;
  sourceCycleAmount: string | null;
  proposedCycleAmount: string | null;
  normalizedMonthlyAmount: string | null;
  pricingAssessment: "matches_current_standard" | "negotiated" | "ambiguous";
  billingAccountId: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  observedProviderInvoiceAmounts: string[];
  observedNativeInvoiceTotals: string[];
  proposedItems: ProposedSubscriptionItem[];
  unmappedAssignmentIds: string[];
  invoiceIds: string[];
  billingInvoiceIds: string[];
  paymentIds: string[];
  issues: MigrationIssue[];
  reviewStatus: MigrationReviewStatus;
};

export type CustomerMigrationReview = {
  customerId: string;
  archived: boolean;
  proposals: SubscriptionMigrationProposal[];
  unmappedAssignmentIds: string[];
  historicalAssignmentIds: string[];
  outstandingNativeBalance: string;
  subscriptionOutstandingNativeBalance: string;
  nonSubscriptionOutstandingNativeBalance: string;
  nativeInvoiceIds: string[];
  billingInvoiceIds: string[];
  paymentIds: string[];
  issues: MigrationIssue[];
  reviewStatus: MigrationReviewStatus;
};

export type MigrationAnalysisMetrics = {
  customers: number;
  legacySubscriptions: number;
  recurringSchedules: number;
  activeAssignments: number;
  proposals: number;
  proposedItems: number;
  mappedAssignments: number;
  unmappedAssignments: number;
  unassignedInventoryDevices: number;
  unassignedInventorySimCards: number;
  proposedCycleAmountKnown: string;
  conflictedCycleAmountKnown: string;
  provisionalNormalizedMonthlyRevenue: string;
  conflictedNormalizedMonthlyRevenue: string;
  unresolvedAmountProposals: number;
  outstandingNativeBalance: string;
  byReviewStatus: Record<MigrationReviewStatus, number>;
};

export type SubscriptionMigrationAnalysis = {
  schemaVersion: "phase-2a-preview-v1";
  analysisDate: string;
  metrics: MigrationAnalysisMetrics;
  customers: CustomerMigrationReview[];
  globalIssues: MigrationIssue[];
};

const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
const ACTIVE_ASSIGNMENT_STATUSES = new Set(["active", "paused"]);
const OPEN_INVOICE_STATUSES = new Set(["open", "partially_paid", "overdue"]);

function cents(value: string): number {
  if (!MONEY_PATTERN.test(value)) throw new Error(`Invalid exact money value: ${value}`);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error(`Money value exceeds safe range: ${value}`);
  return negative ? -result : result;
}

function money(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error("Money arithmetic exceeded safe integer range.");
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function normalizedMonthly(cycleAmount: string | null, interval: number): string | null {
  if (!cycleAmount || ![1, 3, 6, 12].includes(interval)) return null;
  return money(Math.round(cents(cycleAmount) / interval));
}

function issue(
  code: string,
  severity: MigrationIssue["severity"],
  message: string,
  sourceIds: string[],
): MigrationIssue {
  return { code, severity, message, sourceIds: [...sourceIds].sort() };
}

function statusFromIssues(issues: MigrationIssue[], itemCount: number): MigrationReviewStatus {
  if (issues.some((entry) => entry.severity === "conflict")) return "conflict";
  if (itemCount === 0) return "unmapped";
  if (issues.some((entry) => entry.severity === "decision")) return "needs_confirmation";
  return "ready_for_review";
}

function lifecycleFromLegacy(status: string): SubscriptionMigrationProposal["lifecycleStatus"] {
  switch (status) {
    case "active": return "active";
    case "trialing":
    case "pending_payment": return "pending_activation";
    case "paused": return "paused";
    case "canceled": return "canceled";
    case "unpaid":
    case "past_due": return "active";
    default: return "pending_activation";
  }
}

function scheduleLifecycle(status: LegacyRecurringSchedule["status"]): SubscriptionMigrationProposal["lifecycleStatus"] {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  return "ended";
}

function sorted<T extends { id: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function duplicateIssues(
  values: Array<{ id: string; value: string | null }>,
  code: string,
  message: string,
): MigrationIssue[] {
  const groups = new Map<string, string[]>();
  for (const entry of values) {
    const value = entry.value?.trim();
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), entry.id]);
  }
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => issue(code, "conflict", message, ids))
    .sort((left, right) => left.sourceIds.join("|").localeCompare(right.sourceIds.join("|")));
}

function candidateAssignments(
  assignments: LegacyAssignment[],
  customerId: string,
  interval: number,
): LegacyAssignment[] {
  return sorted(assignments.filter((assignment) =>
    assignment.customerId === customerId
    && assignment.endDate == null
    && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
    && assignment.subscriptionItemId == null
    && assignment.intervalMonths === interval,
  ));
}

type ProposalSeed = {
  proposal: Omit<SubscriptionMigrationProposal, "proposedItems" | "unmappedAssignmentIds" | "reviewStatus">;
  directAssignmentId: string | null;
  uniformItemCycleAmount: string | null;
};

function assessRate(
  monthlyRate: string | null,
  interval: number,
  catalogPrices: LegacyCatalogPrice[],
): SubscriptionMigrationProposal["pricingAssessment"] {
  if (!monthlyRate) return "ambiguous";
  const comparable = catalogPrices.filter((entry) =>
    entry.isActive && entry.durationMonths === interval,
  );
  if (!comparable.length) return "ambiguous";
  return comparable.some((entry) => cents(entry.monthlyRateXcd) === cents(monthlyRate))
    ? "matches_current_standard"
    : "negotiated";
}

function subscriptionSeed(
  subscription: LegacySubscription,
  customer: LegacyCustomer,
  billingAccounts: LegacyBillingAccount[],
  catalogPrices: LegacyCatalogPrice[],
  billingInvoices: LegacyBillingInvoice[],
  invoices: LegacyInvoice[],
  payments: LegacyPayment[],
): ProposalSeed {
  const issues: MigrationIssue[] = [];
  const interval = subscription.planTermMonths;
  if (![1, 3, 6, 12].includes(interval)) {
    issues.push(issue(
      "unsupported_interval",
      "conflict",
      "The legacy term is not supported by the canonical 1/3/6/12 month cadence.",
      [subscription.id],
    ));
  }
  const collectionMethod = subscription.stripeSubscriptionId || customer.billingMode === "stripe_subscription"
    ? "stripe_autocharge" as const
    : null;
  if (!collectionMethod) {
    issues.push(issue(
      "collection_method_unknown",
      "decision",
      "This legacy subscription has no Stripe subscription identifier and no explicit manual schedule.",
      [subscription.id],
    ));
  }
  if (collectionMethod === "stripe_autocharge" && !subscription.stripeSubscriptionId) {
    issues.push(issue(
      "stripe_subscription_id_missing",
      "decision",
      "Stripe collection is indicated, but no Stripe subscription identifier is stored locally.",
      [subscription.id],
    ));
  }
  const stripeAccount = sorted(billingAccounts.filter((account) =>
    account.customerId === subscription.customerId && account.provider === "stripe",
  ))[0] ?? null;
  if (
    stripeAccount
    && subscription.stripeCustomerId
    && stripeAccount.externalCustomerId !== subscription.stripeCustomerId
  ) {
    issues.push(issue(
      "stripe_customer_reference_mismatch",
      "conflict",
      "The legacy subscription and Stripe billing account reference different provider customers.",
      [subscription.id, stripeAccount.id],
    ));
  }

  const quantity = subscription.vehicleCount;
  let unitCycleAmount: string | null = subscription.agreedAmountPerCycle;
  let sourceCycleAmount: string | null = unitCycleAmount && quantity != null
    ? money(cents(unitCycleAmount) * quantity)
    : null;
  let cycleAmount = sourceCycleAmount;
  if (!unitCycleAmount && subscription.monthlyRateXcd && quantity != null) {
    if (interval === 1) {
      unitCycleAmount = subscription.monthlyRateXcd;
      cycleAmount = money(cents(subscription.monthlyRateXcd) * quantity);
      sourceCycleAmount = cycleAmount;
    } else if (interval === 3 || interval === 6) {
      unitCycleAmount = money(cents(subscription.monthlyRateXcd) * interval);
      cycleAmount = money(cents(subscription.monthlyRateXcd) * quantity * interval);
      issues.push(issue(
        "multi_month_price_inferred",
        "decision",
        "The cycle amount is inferred from a monthly reference rate and must be confirmed against the agreement.",
        [subscription.id],
      ));
    } else if (interval === 12) {
      issues.push(issue(
        "annual_price_requires_verification",
        "decision",
        "Annual pricing is not reconstructed from the historical discount formula; confirm the explicit agreed annual amount.",
        [subscription.id],
      ));
    }
  }
  if (quantity == null || quantity < 1) {
    issues.push(issue(
      "source_quantity_missing",
      "decision",
      "The legacy subscription does not contain a reliable positive service quantity.",
      [subscription.id],
    ));
  }
  if (!cycleAmount) {
    issues.push(issue(
      "cycle_amount_unresolved",
      "decision",
      "No explicit canonical cycle amount can be proposed from local records.",
      [subscription.id],
    ));
  }
  const pricingAssessment = assessRate(
    subscription.monthlyRateXcd ?? (interval === 1 ? subscription.agreedAmountPerCycle : null),
    interval,
    catalogPrices,
  );
  if (pricingAssessment === "ambiguous") {
    issues.push(issue(
      "pricing_classification_ambiguous",
      "decision",
      "The source price cannot be classified against an active standard catalog rate.",
      [subscription.id],
    ));
  }

  const relatedBillingInvoices = sorted(billingInvoices.filter((invoice) =>
    invoice.customerSubscriptionId === subscription.id
    || (subscription.stripeSubscriptionId != null
      && invoice.stripeSubscriptionId === subscription.stripeSubscriptionId),
  ));
  const relatedInvoices = sorted(invoices.filter((invoice) =>
    invoice.customerSubscriptionId === subscription.id
    || relatedBillingInvoices.some((providerInvoice) => providerInvoice.id === invoice.billingInvoiceId),
  ));
  const relatedPayments = sorted(payments.filter((payment) =>
    relatedInvoices.some((invoice) => invoice.id === payment.invoiceId),
  ));
  const actualAmounts = new Set(relatedBillingInvoices
    .filter((invoice) => invoice.kind === "subscription")
    .map((invoice) => invoice.amountXcd));
  if (cycleAmount && actualAmounts.size > 0 && !actualAmounts.has(cycleAmount)) {
    issues.push(issue(
      "provider_amount_differs",
      "decision",
      "Mirrored provider invoice amounts do not include the proposed cycle total; review taxes, fees, one-offs, and actual Stripe items.",
      relatedBillingInvoices.map((invoice) => invoice.id),
    ));
  }
  const unresolvedProviderInvoices = relatedBillingInvoices.filter((invoice) =>
    !["paid", "void", "uncollectible"].includes(invoice.status.toLowerCase()),
  );
  if (unresolvedProviderInvoices.length) {
    issues.push(issue(
      "provider_invoices_unresolved",
      "decision",
      "Related provider invoices include unpaid or unresolved states that require financial review.",
      unresolvedProviderInvoices.map((invoice) => invoice.id),
    ));
  }
  const unresolvedNativeInvoices = relatedInvoices.filter((invoice) =>
    OPEN_INVOICE_STATUSES.has(invoice.status),
  );
  if (unresolvedNativeInvoices.length) {
    issues.push(issue(
      "native_invoices_unresolved",
      "decision",
      "Related native invoices include outstanding or partially paid balances.",
      unresolvedNativeInvoices.map((invoice) => invoice.id),
    ));
  }

  return {
    proposal: {
      proposalId: `subscription:${subscription.id}`,
      customerId: subscription.customerId,
      sourceKind: collectionMethod === "stripe_autocharge" ? "stripe_subscription" : "legacy_subscription",
      sourceId: subscription.id,
      collectionMethod,
      lifecycleStatus: lifecycleFromLegacy(subscription.status),
      billingIntervalMonths: interval,
      currency: (subscription.currency ?? "XCD").toUpperCase(),
      billingAnchorDate: subscription.billingAnchorDate ?? subscription.currentPeriodStart,
      nextBillingDate: subscription.nextBillingDate ?? subscription.currentPeriodEnd,
      sourceQuantity: quantity,
      sourceCycleAmount,
      proposedCycleAmount: cycleAmount,
      normalizedMonthlyAmount: normalizedMonthly(cycleAmount, interval),
      pricingAssessment,
      billingAccountId: stripeAccount?.id ?? null,
      providerCustomerId: subscription.stripeCustomerId ?? stripeAccount?.externalCustomerId ?? null,
      providerSubscriptionId: subscription.stripeSubscriptionId,
      observedProviderInvoiceAmounts: [...actualAmounts].sort((left, right) => cents(left) - cents(right)),
      observedNativeInvoiceTotals: [...new Set(relatedInvoices.map((invoice) => invoice.total))]
        .sort((left, right) => cents(left) - cents(right)),
      invoiceIds: relatedInvoices.map((invoice) => invoice.id),
      billingInvoiceIds: relatedBillingInvoices.map((invoice) => invoice.id),
      paymentIds: relatedPayments.map((payment) => payment.id),
      issues,
    },
    directAssignmentId: null,
    uniformItemCycleAmount: unitCycleAmount,
  };
}

function scheduleSeed(
  schedule: LegacyRecurringSchedule,
  catalogPrices: LegacyCatalogPrice[],
  invoices: LegacyInvoice[],
  payments: LegacyPayment[],
): ProposalSeed {
  const issues: MigrationIssue[] = [];
  const cycleCents = schedule.lineItems.reduce((total, line) => total + cents(line.lineTotal), 0);
  const quantity = schedule.lineItems.reduce((total, line) => {
    const parsed = Number(line.quantity);
    return Number.isInteger(parsed) && parsed > 0 ? total + parsed : total;
  }, 0);
  if (schedule.lineItems.length && quantity === 0) {
    issues.push(issue(
      "schedule_quantity_unusable",
      "decision",
      "Schedule quantities are not positive whole service counts and cannot drive item creation.",
      [schedule.id, ...schedule.lineItems.map((line) => line.id)],
    ));
  }
  if (schedule.lineItems.length === 0) {
    issues.push(issue(
      "schedule_has_no_lines",
      "conflict",
      "The recurring schedule has no line items from which to preserve pricing.",
      [schedule.id],
    ));
  }
  if (![1, 3, 6, 12].includes(schedule.intervalMonths)) {
    issues.push(issue(
      "unsupported_interval",
      "conflict",
      "The recurring schedule cadence is not supported by the canonical 1/3/6/12 month cadence.",
      [schedule.id],
    ));
  }
  const relatedInvoices = sorted(invoices.filter((invoice) => invoice.recurringScheduleId === schedule.id));
  const relatedPayments = sorted(payments.filter((payment) =>
    relatedInvoices.some((invoice) => invoice.id === payment.invoiceId),
  ));
  const unresolvedInvoices = relatedInvoices.filter((invoice) =>
    OPEN_INVOICE_STATUSES.has(invoice.status),
  );
  if (unresolvedInvoices.length) {
    issues.push(issue(
      "native_invoices_unresolved",
      "decision",
      "Related native invoices include outstanding or partially paid balances.",
      unresolvedInvoices.map((invoice) => invoice.id),
    ));
  }
  const cycleAmount = schedule.lineItems.length ? money(cycleCents) : null;
  const unitPrices = new Set(schedule.lineItems.map((line) => money(cents(line.unitPrice))));
  const uniformItemCycleAmount = unitPrices.size === 1 ? [...unitPrices][0] : null;
  if (schedule.lineItems.length && !uniformItemCycleAmount) {
    issues.push(issue(
      "heterogeneous_schedule_rates",
      "decision",
      "The schedule contains different item rates without item-to-assignment links; preserve the total but confirm each service price.",
      [schedule.id, ...schedule.lineItems.map((line) => line.id)],
    ));
  }
  const pricingAssessment = schedule.intervalMonths === 1
    ? assessRate(uniformItemCycleAmount, 1, catalogPrices)
    : "ambiguous";
  if (pricingAssessment === "ambiguous") {
    issues.push(issue(
      "pricing_classification_ambiguous",
      "decision",
      "The schedule item price cannot be classified against an active standard monthly catalog rate.",
      [schedule.id],
    ));
  }
  return {
    proposal: {
      proposalId: `schedule:${schedule.id}`,
      customerId: schedule.customerId ?? "unlinked-customer",
      sourceKind: "manual_schedule",
      sourceId: schedule.id,
      collectionMethod: "manual_invoice",
      lifecycleStatus: scheduleLifecycle(schedule.status),
      billingIntervalMonths: schedule.intervalMonths,
      currency: schedule.currency.toUpperCase(),
      billingAnchorDate: null,
      nextBillingDate: schedule.nextIssueDate,
      sourceQuantity: quantity || null,
      sourceCycleAmount: cycleAmount,
      proposedCycleAmount: cycleAmount,
      normalizedMonthlyAmount: normalizedMonthly(cycleAmount, schedule.intervalMonths),
      pricingAssessment,
      billingAccountId: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      observedProviderInvoiceAmounts: [],
      observedNativeInvoiceTotals: [...new Set(relatedInvoices.map((invoice) => invoice.total))]
        .sort((left, right) => cents(left) - cents(right)),
      invoiceIds: relatedInvoices.map((invoice) => invoice.id),
      billingInvoiceIds: [],
      paymentIds: relatedPayments.map((payment) => payment.id),
      issues,
    },
    directAssignmentId: schedule.serviceAssignmentId,
    uniformItemCycleAmount,
  };
}

/**
 * A deliberately narrow source for established cheque/cash arrangements that have
 * an issued native invoice but never used RecurringInvoiceSchedule.  It is only
 * considered when the customer has no active legacy schedule, and it preserves the
 * invoice itself as the source id/fingerprint rather than inventing a schedule.
 */
function manualInvoiceSeed(
  invoice: LegacyInvoice,
  assignments: LegacyAssignment[],
  catalogPrices: LegacyCatalogPrice[],
  payments: LegacyPayment[],
): ProposalSeed {
  const issues: MigrationIssue[] = [];
  const activeAssignments = assignments.filter((assignment) =>
    assignment.endDate == null
    && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
    && assignment.subscriptionItemId == null,
  );
  const intervals = [...new Set(activeAssignments
    .flatMap((assignment) => assignment.intervalMonths != null ? [assignment.intervalMonths] : [])
    .filter((interval) => [1, 3, 6, 12].includes(interval)))];
  const interval = intervals.length === 1 ? intervals[0] : 0;
  if (!interval) {
    issues.push(issue(
      "manual_invoice_interval_unresolved",
      "conflict",
      "An established manual invoice needs one explicit supported service interval before it can be prepared for canonical billing.",
      [invoice.id, ...activeAssignments.map((assignment) => assignment.id)],
    ));
  }
  const renewalDates = [...new Set(activeAssignments
    .filter((assignment) => assignment.intervalMonths === interval)
    .flatMap((assignment) => assignment.nextDueDate ? [assignment.nextDueDate.slice(0, 10)] : []))];
  const nextBillingDate = renewalDates.length === 1 ? renewalDates[0] : null;
  if (!nextBillingDate) {
    issues.push(issue(
      "manual_invoice_renewal_unresolved",
      "conflict",
      "The existing invoice does not establish one shared next renewal from the linked active services.",
      [invoice.id, ...activeAssignments.map((assignment) => assignment.id)],
    ));
  }
  const invoiceLines = invoice.lineItems ?? [];
  const subtotal = invoice.subtotal ?? invoice.total;
  const taxTotal = invoice.taxTotal ?? "0.00";
  const sourceQuantity = invoiceLines.reduce((total, line) => {
    const quantity = Number(line.quantity);
    return Number.isInteger(quantity) && quantity > 0 ? total + quantity : total;
  }, 0) || null;
  if (!sourceQuantity) {
    issues.push(issue(
      "manual_invoice_quantity_unresolved",
      "decision",
      "The manual invoice has no reliable positive line-item quantity; each service must be explicitly confirmed.",
      [invoice.id],
    ));
  }
  const lineSubtotal = invoiceLines.reduce((total, line) => total + cents(line.lineTotal), 0);
  if (invoiceLines.length && lineSubtotal !== cents(subtotal)) {
    issues.push(issue(
      "manual_invoice_subtotal_mismatch",
      "conflict",
      "The manual invoice line items do not reconcile to its stored subtotal.",
      [invoice.id, ...invoiceLines.map((line) => line.id)],
    ));
  }
  if (cents(subtotal) + cents(taxTotal) !== cents(invoice.total)) {
    issues.push(issue(
      "manual_invoice_tax_mismatch",
      "conflict",
      "The manual invoice subtotal and tax do not reconcile to its total.",
      [invoice.id],
    ));
  }
  const unitPrices = new Set(invoiceLines.map((line) => money(cents(line.unitPrice))));
  const uniformItemCycleAmount = unitPrices.size === 1 ? [...unitPrices][0] : null;
  const durationAggregateInvoice = Boolean(
    interval
    && invoiceLines.length === 1
    && sourceQuantity === interval
    && lineSubtotal === cents(subtotal)
    && cents(invoiceLines[0].unitPrice) > 0,
  );
  const assignmentQuantity = durationAggregateInvoice
    ? activeAssignments.filter((assignment) => assignment.intervalMonths === interval).length
    : null;
  if (durationAggregateInvoice) {
    issues.push(issue(
      "manual_invoice_duration_aggregate_pricing",
      "decision",
      "The invoice records billing duration times an aggregate monthly fleet price. Every active service, its cycle price, and the covered period require explicit confirmation.",
      [invoice.id, ...activeAssignments.map((assignment) => assignment.id)],
    ));
  }
  const pricingAssessment = assessRate(
    interval === 1 && !durationAggregateInvoice ? uniformItemCycleAmount : null,
    interval || 1,
    catalogPrices,
  );
  if (pricingAssessment === "ambiguous") {
    issues.push(issue(
      "pricing_classification_ambiguous",
      "decision",
      "The established manual invoice rate must be classified and confirmed for each service.",
      [invoice.id],
    ));
  }
  const relatedPayments = sorted(payments.filter((payment) => payment.invoiceId === invoice.id));
  return {
    proposal: {
      proposalId: `manual-invoice:${invoice.id}`,
      customerId: invoice.customerId ?? "unlinked-customer",
      sourceKind: "manual_invoice",
      sourceId: invoice.id,
      collectionMethod: "manual_invoice",
      lifecycleStatus: "active",
      billingIntervalMonths: interval || 1,
      currency: invoice.currency.toUpperCase(),
      billingAnchorDate: invoice.issueDate,
      nextBillingDate,
      sourceQuantity,
      assignmentQuantity,
      sourceCycleAmount: subtotal,
      proposedCycleAmount: subtotal,
      normalizedMonthlyAmount: interval ? normalizedMonthly(subtotal, interval) : null,
      pricingAssessment,
      billingAccountId: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      observedProviderInvoiceAmounts: [],
      observedNativeInvoiceTotals: [invoice.total],
      invoiceIds: [invoice.id],
      billingInvoiceIds: [],
      paymentIds: relatedPayments.map((payment) => payment.id),
      issues,
    },
    directAssignmentId: null,
    uniformItemCycleAmount,
  };
}

function allocateItems(
  seed: ProposalSeed,
  candidates: LegacyAssignment[],
  sameIntervalProposalCount: number,
): SubscriptionMigrationProposal {
  const proposal = seed.proposal;
  const issues = [...proposal.issues];
  let mapped: LegacyAssignment[] = [];
  if (seed.directAssignmentId) {
    const direct = candidates.find((assignment) => assignment.id === seed.directAssignmentId);
    if (direct) mapped = [direct];
    else issues.push(issue(
      "direct_assignment_unavailable",
      "conflict",
      "The schedule's direct service assignment is closed, mismatched, already canonical, or absent.",
      [proposal.sourceId, seed.directAssignmentId],
    ));
  } else if (sameIntervalProposalCount > 1 && candidates.length > 0) {
    issues.push(issue(
      "multiple_arrangements_same_interval",
      "conflict",
      "Multiple billing arrangements share this cadence; assignments cannot be divided safely without confirmation.",
      [proposal.sourceId, ...candidates.map((assignment) => assignment.id)],
    ));
  } else if ((proposal.assignmentQuantity ?? proposal.sourceQuantity) != null
    && candidates.length === (proposal.assignmentQuantity ?? proposal.sourceQuantity)) {
    mapped = candidates;
  } else if (candidates.length > 0) {
    issues.push(issue(
      "assignment_quantity_mismatch",
      "decision",
      "Active assignments matching the cadence do not equal the source quantity.",
      [proposal.sourceId, ...candidates.map((assignment) => assignment.id)],
    ));
  }

  const perItem = seed.uniformItemCycleAmount;
  if (
    mapped.length > 0
    && proposal.proposedCycleAmount
    && perItem
    && cents(perItem) * mapped.length !== cents(proposal.proposedCycleAmount)
  ) {
    issues.push(issue(
      "item_price_allocation_requires_confirmation",
      "decision",
      "Mapped item rates do not reconcile exactly to the source cycle total.",
      [proposal.sourceId],
    ));
  }
  const evidence: ProposedSubscriptionItem["pricingEvidence"] = proposal.sourceKind === "manual_schedule"
    ? "schedule_total_allocation"
    : proposal.billingIntervalMonths === 1 ? "monthly_rate" : "explicit_cycle_amount";
  const proposedItems = mapped.map((assignment) => ({
    proposalItemId: `${proposal.proposalId}:assignment:${assignment.id}`,
    serviceAssignmentId: assignment.id,
    deviceId: assignment.deviceId,
    simCardId: assignment.simCardId,
    proposedCycleAmount: perItem,
    currency: proposal.currency,
    pricingEvidence: perItem ? evidence : "unresolved" as const,
    rateClassification: proposal.pricingAssessment === "matches_current_standard"
      ? "standard" as const
      : proposal.pricingAssessment === "negotiated"
        ? "negotiated" as const
        : "requires_confirmation" as const,
  }));
  const mappedIds = new Set(mapped.map((assignment) => assignment.id));
  const unmappedAssignmentIds = candidates
    .filter((assignment) => !mappedIds.has(assignment.id))
    .map((assignment) => assignment.id);
  const expectedAssignmentCount = proposal.assignmentQuantity ?? proposal.sourceQuantity;
  if (expectedAssignmentCount != null && mapped.length !== expectedAssignmentCount) {
    issues.push(issue(
      "proposed_item_count_differs",
      "decision",
      "The proposed canonical item count does not match the legacy billing quantity.",
      [proposal.sourceId],
    ));
  }
  if (["canceled", "ended"].includes(proposal.lifecycleStatus) && mapped.length > 0) {
    issues.push(issue(
      "closed_arrangement_has_active_assignments",
      "conflict",
      "A canceled or ended billing arrangement still matches active service assignments.",
      [proposal.sourceId, ...mapped.map((assignment) => assignment.id)],
    ));
  }
  const renewalDates = new Set(mapped
    .flatMap((assignment) => assignment.nextDueDate ? [assignment.nextDueDate.slice(0, 10)] : []));
  if (renewalDates.size > 1) {
    issues.push(issue(
      "conflicting_assignment_renewals",
      "conflict",
      "Mapped assignments have different next-due dates and cannot share one anchor without review.",
      mapped.map((assignment) => assignment.id),
    ));
  }
  if (
    proposal.nextBillingDate
    && renewalDates.size === 1
    && !renewalDates.has(proposal.nextBillingDate.slice(0, 10))
  ) {
    issues.push(issue(
      "billing_anchor_mismatch",
      "decision",
      "The billing arrangement's next date differs from its mapped assignment renewal date.",
      [proposal.sourceId, ...mapped.map((assignment) => assignment.id)],
    ));
  }
  return {
    ...proposal,
    proposedItems,
    unmappedAssignmentIds,
    issues,
    reviewStatus: statusFromIssues(issues, proposedItems.length),
  };
}

function sumMoney(values: Array<string | null>): string {
  return money(values.reduce((total, value) => total + (value ? cents(value) : 0), 0));
}

export function analyzeSubscriptionMigration(
  snapshot: LegacyBillingSnapshot,
): SubscriptionMigrationAnalysis {
  const globalIssues: MigrationIssue[] = [
    ...duplicateIssues(
      snapshot.subscriptions.map((entry) => ({ id: entry.id, value: entry.stripeSubscriptionId })),
      "duplicate_stripe_subscription",
      "One Stripe subscription identifier appears on multiple local subscription rows.",
    ),
    ...duplicateIssues(
      snapshot.billingInvoices.map((entry) => ({ id: entry.id, value: `${entry.provider}:${entry.externalInvoiceId}` })),
      "duplicate_provider_invoice",
      "One provider invoice identifier appears on multiple mirrored invoice rows.",
    ),
    ...duplicateIssues(
      snapshot.payments.map((entry) => ({ id: entry.id, value: entry.stripePaymentIntentId })),
      "duplicate_stripe_payment",
      "One Stripe payment identifier appears on multiple native payment rows.",
    ),
    ...duplicateIssues(
      snapshot.invoices.map((entry) => ({ id: entry.id, value: entry.recurringGenerationKey })),
      "duplicate_recurring_generation",
      "One recurring generation key appears on multiple native invoices.",
    ),
  ];

  const legacySubscriptions = sorted(snapshot.subscriptions.filter((entry) => entry.controlMode === "legacy"));
  const schedules = sorted(snapshot.recurringSchedules);
  const unlinkedSchedules = schedules.filter((entry) => entry.customerId == null);
  if (unlinkedSchedules.length) {
    globalIssues.push(issue(
      "recurring_schedule_without_customer",
      "conflict",
      "Recurring schedules without a customer cannot be proposed for canonical migration.",
      unlinkedSchedules.map((entry) => entry.id),
    ));
  }
  const customerReviews: CustomerMigrationReview[] = [];

  for (const customer of sorted(snapshot.customers)) {
    const customerIssues: MigrationIssue[] = [];
    if (customer.archivedAt) {
      customerIssues.push(issue(
        "archived_customer_has_billing_history",
        "decision",
        "The customer is archived; any proposed agreement must be reviewed as history rather than activated.",
        [customer.id],
      ));
    }
    const customerSubscriptions = legacySubscriptions.filter((entry) => entry.customerId === customer.id);
    const customerSchedules = schedules.filter((entry) => entry.customerId === customer.id);
    const customerAssignments = sorted(snapshot.assignments.filter((entry) => entry.customerId === customer.id));
    const activeAssignments = customerAssignments.filter((entry) =>
      entry.endDate == null && ACTIVE_ASSIGNMENT_STATUSES.has(entry.status),
    );
    const historicalAssignments = customerAssignments.filter((entry) =>
      entry.endDate != null || entry.status === "cancelled",
    );
    const orphanCanceled = customerAssignments.filter((entry) =>
      entry.status === "cancelled" && entry.endDate == null,
    );
    if (orphanCanceled.length) {
      customerIssues.push(issue(
        "canceled_assignment_without_end_date",
        "decision",
        "Canceled assignments without an end date are treated as historical and are never proposed as active items.",
        orphanCanceled.map((entry) => entry.id),
      ));
    }
    const activeStripe = customerSubscriptions.some((entry) =>
      entry.status !== "canceled" && entry.stripeSubscriptionId,
    );
    const activeManual = customerSchedules.some((entry) => entry.status === "active");
    if (activeStripe && activeManual) {
      customerIssues.push(issue(
        "manual_automatic_overlap",
        "conflict",
        "The customer has active Stripe and manual recurring arrangements; billing ownership must be confirmed.",
        [
          ...customerSubscriptions.filter((entry) => entry.stripeSubscriptionId).map((entry) => entry.id),
          ...customerSchedules.filter((entry) => entry.status === "active").map((entry) => entry.id),
        ],
      ));
    }

    const manuallyRepresentedSubscriptionIds = new Set(customerSchedules
      .flatMap((entry) => entry.customerSubscriptionId ? [entry.customerSubscriptionId] : []));
    const standaloneSubscriptions = customerSubscriptions.filter((entry) =>
      !manuallyRepresentedSubscriptionIds.has(entry.id)
      || entry.stripeSubscriptionId != null
      || customer.billingMode === "stripe_subscription",
    );
    const directManualInvoices = customerSchedules.length === 0
      ? snapshot.invoices.filter((invoice) =>
        invoice.customerId === customer.id
        && invoice.customerSubscriptionId == null
        && invoice.recurringScheduleId == null
        && invoice.billingInvoiceId == null
        && invoice.archivedAt == null
        && !["void", "written_off"].includes(invoice.status),
      )
      : [];
    const seeds: ProposalSeed[] = [
      ...standaloneSubscriptions.map((entry) => subscriptionSeed(
        entry,
        customer,
        snapshot.billingAccounts,
        snapshot.catalogPrices,
        snapshot.billingInvoices,
        snapshot.invoices,
        snapshot.payments,
      )),
      ...customerSchedules.map((entry) => scheduleSeed(
        entry,
        snapshot.catalogPrices,
        snapshot.invoices,
        snapshot.payments,
      )),
      ...directManualInvoices.map((entry) => manualInvoiceSeed(
        entry,
        customerAssignments,
        snapshot.catalogPrices,
        snapshot.payments,
      )),
    ];
    // Historical canceled/ended arrangements remain in the audit analysis, but
    // they must not compete with a current arrangement for active services.
    // Otherwise every old checkout/subscription attempt makes the real source
    // appear to have zero safely attributable services.
    const currentSeeds = seeds.filter((seed) =>
      !["canceled", "ended"].includes(seed.proposal.lifecycleStatus),
    );
    const proposalCounts = new Map<number, number>();
    for (const seed of currentSeeds) {
      const interval = seed.proposal.billingIntervalMonths;
      proposalCounts.set(interval, (proposalCounts.get(interval) ?? 0) + 1);
    }
    let proposals = seeds.map((seed) => allocateItems(
      seed,
      candidateAssignments(snapshot.assignments, customer.id, seed.proposal.billingIntervalMonths),
      ["canceled", "ended"].includes(seed.proposal.lifecycleStatus)
        ? 1
        : proposalCounts.get(seed.proposal.billingIntervalMonths) ?? 0,
    ));
    if (customerIssues.some((entry) => entry.severity === "conflict")) {
      proposals = proposals.map((proposal) => ({
        ...proposal,
        issues: [...proposal.issues, ...customerIssues.filter((entry) => entry.severity === "conflict")],
        reviewStatus: "conflict" as const,
      }));
    }

    const mappedIds = new Set(proposals.flatMap((proposal) =>
      proposal.proposedItems.map((item) => item.serviceAssignmentId),
    ));
    const unmappedAssignmentIds = activeAssignments
      .filter((assignment) => assignment.subscriptionItemId == null && !mappedIds.has(assignment.id))
      .map((assignment) => assignment.id);
    if (unmappedAssignmentIds.length) {
      customerIssues.push(issue(
        "active_assignments_unmapped",
        "decision",
        "One or more active legacy assignments are not safely attributable to a proposed subscription.",
        unmappedAssignmentIds,
      ));
    }
    if (seeds.length === 0 && activeAssignments.length) {
      customerIssues.push(issue(
        "services_without_billing_arrangement",
        "conflict",
        "Active services exist without a local legacy subscription or recurring schedule.",
        activeAssignments.map((entry) => entry.id),
      ));
    }

    const nativeInvoices = sorted(snapshot.invoices.filter((entry) => entry.customerId === customer.id));
    const billingInvoices = sorted(snapshot.billingInvoices.filter((entry) => entry.customerId === customer.id));
    const payments = sorted(snapshot.payments.filter((entry) =>
      entry.customerId === customer.id || nativeInvoices.some((invoice) => invoice.id === entry.invoiceId),
    ));
    for (const invoice of nativeInvoices) {
      const recordedPayment = payments
        .filter((payment) => payment.invoiceId === invoice.id && payment.voidedAt == null)
        .reduce((total, payment) => total + cents(payment.amount), 0);
      if (recordedPayment !== cents(invoice.amountPaid)) {
        customerIssues.push(issue(
          "invoice_payment_total_mismatch",
          "conflict",
          "The invoice amount-paid snapshot differs from its non-voided native payment records.",
          [invoice.id, ...payments.filter((payment) => payment.invoiceId === invoice.id).map((payment) => payment.id)],
        ));
      }
      if (cents(invoice.total) - cents(invoice.amountPaid) !== cents(invoice.amountDue)) {
        customerIssues.push(issue(
          "invoice_balance_arithmetic_mismatch",
          "conflict",
          "Invoice total minus amount paid does not equal the stored amount due.",
          [invoice.id],
        ));
      }
    }
    const outstanding = sumMoney(nativeInvoices
      .filter((entry) => !entry.archivedAt && OPEN_INVOICE_STATUSES.has(entry.status))
      .map((entry) => entry.amountDue));
    const subscriptionOutstanding = sumMoney(nativeInvoices
      .filter((entry) => !entry.archivedAt && OPEN_INVOICE_STATUSES.has(entry.status) && entry.migrationClassification !== "non_subscription")
      .map((entry) => entry.amountDue));
    const nonSubscriptionOutstanding = sumMoney(nativeInvoices
      .filter((entry) => !entry.archivedAt && OPEN_INVOICE_STATUSES.has(entry.status) && entry.migrationClassification === "non_subscription")
      .map((entry) => entry.amountDue));
    const combinedIssues = [...customerIssues, ...proposals.flatMap((entry) => entry.issues)];
    customerReviews.push({
      customerId: customer.id,
      archived: customer.archivedAt != null,
      proposals,
      unmappedAssignmentIds,
      historicalAssignmentIds: historicalAssignments.map((entry) => entry.id),
      outstandingNativeBalance: outstanding,
      subscriptionOutstandingNativeBalance: subscriptionOutstanding,
      nonSubscriptionOutstandingNativeBalance: nonSubscriptionOutstanding,
      nativeInvoiceIds: nativeInvoices.map((entry) => entry.id),
      billingInvoiceIds: billingInvoices.map((entry) => entry.id),
      paymentIds: payments.map((entry) => entry.id),
      issues: customerIssues,
      reviewStatus: statusFromIssues(combinedIssues, proposals.reduce((total, entry) => total + entry.proposedItems.length, 0)),
    });
  }

  const allProposals = customerReviews.flatMap((entry) => entry.proposals);
  const mappedAssignments = new Set(allProposals.flatMap((proposal) =>
    proposal.proposedItems.map((item) => item.serviceAssignmentId),
  ));
  const activeAssignments = snapshot.assignments.filter((entry) =>
    entry.endDate == null && ACTIVE_ASSIGNMENT_STATUSES.has(entry.status),
  );
  const assignedDevices = new Set(snapshot.assignments.map((entry) => entry.deviceId));
  const assignedSims = new Set(snapshot.assignments.flatMap((entry) => entry.simCardId ? [entry.simCardId] : []));
  const byReviewStatus: Record<MigrationReviewStatus, number> = {
    ready_for_review: 0,
    needs_confirmation: 0,
    conflict: 0,
    unmapped: 0,
  };
  for (const proposal of allProposals) byReviewStatus[proposal.reviewStatus] += 1;
  const reviewableProposals = allProposals.filter((proposal) =>
    proposal.reviewStatus === "ready_for_review" || proposal.reviewStatus === "needs_confirmation",
  );
  const conflictedProposals = allProposals.filter((proposal) => proposal.reviewStatus === "conflict");

  return {
    schemaVersion: "phase-2a-preview-v1",
    analysisDate: snapshot.analysisDate,
    metrics: {
      customers: customerReviews.length,
      legacySubscriptions: legacySubscriptions.length,
      recurringSchedules: schedules.length,
      activeAssignments: activeAssignments.length,
      proposals: allProposals.length,
      proposedItems: allProposals.reduce((total, entry) => total + entry.proposedItems.length, 0),
      mappedAssignments: mappedAssignments.size,
      unmappedAssignments: activeAssignments.filter((entry) =>
        entry.subscriptionItemId == null && !mappedAssignments.has(entry.id),
      ).length,
      unassignedInventoryDevices: snapshot.inventory.deviceIds.filter((id) => !assignedDevices.has(id)).length,
      unassignedInventorySimCards: snapshot.inventory.simCardIds.filter((id) => !assignedSims.has(id)).length,
      proposedCycleAmountKnown: sumMoney(reviewableProposals.map((entry) => entry.proposedCycleAmount)),
      conflictedCycleAmountKnown: sumMoney(conflictedProposals.map((entry) => entry.proposedCycleAmount)),
      provisionalNormalizedMonthlyRevenue: sumMoney(
        reviewableProposals.map((entry) => entry.normalizedMonthlyAmount),
      ),
      conflictedNormalizedMonthlyRevenue: sumMoney(
        conflictedProposals.map((entry) => entry.normalizedMonthlyAmount),
      ),
      unresolvedAmountProposals: allProposals.filter((entry) => entry.proposedCycleAmount == null).length,
      outstandingNativeBalance: sumMoney(customerReviews.map((entry) => entry.outstandingNativeBalance)),
      byReviewStatus,
    },
    customers: customerReviews,
    globalIssues: [...globalIssues].sort((left, right) =>
      `${left.code}:${left.sourceIds.join("|")}`.localeCompare(`${right.code}:${right.sourceIds.join("|")}`),
    ),
  };
}

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  // Treat every exported value as untrusted spreadsheet input. A leading apostrophe
  // prevents Excel/Sheets from evaluating formulas while preserving the visible value.
  const spreadsheetSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(spreadsheetSafe)
    ? `"${spreadsheetSafe.replaceAll('"', '""')}"`
    : spreadsheetSafe;
}

export function subscriptionMigrationAnalysisCsv(analysis: SubscriptionMigrationAnalysis): string {
  const rows: Array<Array<string | number | null>> = [[
    "customer_id",
    "proposal_id",
    "source_kind",
    "source_id",
    "review_status",
    "collection_method",
    "interval_months",
    "source_quantity",
    "proposed_item_count",
    "proposed_cycle_amount",
    "normalized_monthly_amount",
    "pricing_assessment",
    "billing_account_id",
    "provider_subscription_id",
    "observed_provider_amounts",
    "observed_native_totals",
    "next_billing_date",
    "issue_codes",
  ]];
  for (const customer of analysis.customers) {
    for (const proposal of customer.proposals) {
      rows.push([
        customer.customerId,
        proposal.proposalId,
        proposal.sourceKind,
        proposal.sourceId,
        proposal.reviewStatus,
        proposal.collectionMethod,
        proposal.billingIntervalMonths,
        proposal.sourceQuantity,
        proposal.proposedItems.length,
        proposal.proposedCycleAmount,
        proposal.normalizedMonthlyAmount,
        proposal.pricingAssessment,
        proposal.billingAccountId,
        proposal.providerSubscriptionId,
        proposal.observedProviderInvoiceAmounts.join("|"),
        proposal.observedNativeInvoiceTotals.join("|"),
        proposal.nextBillingDate,
        proposal.issues.map((entry) => entry.code).sort().join("|"),
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function subscriptionMigrationAnalysisMarkdown(
  analysis: SubscriptionMigrationAnalysis,
): string {
  const lines = [
    "# Subscription migration dry-run",
    "",
    `Analysis date: ${analysis.analysisDate}`,
    "",
    "## Aggregate reconciliation",
    "",
    `- Customers: ${analysis.metrics.customers}`,
    `- Proposals: ${analysis.metrics.proposals}`,
    `- Proposed items: ${analysis.metrics.proposedItems}`,
    `- Mapped / unmapped assignments: ${analysis.metrics.mappedAssignments} / ${analysis.metrics.unmappedAssignments}`,
    `- Known reviewable cycle total: ${analysis.metrics.proposedCycleAmountKnown}`,
    `- Conflicted candidate cycle total (excluded): ${analysis.metrics.conflictedCycleAmountKnown}`,
    `- Provisional reviewable monthly revenue: ${analysis.metrics.provisionalNormalizedMonthlyRevenue}`,
    `- Conflicted candidate monthly revenue (excluded): ${analysis.metrics.conflictedNormalizedMonthlyRevenue}`,
    `- Proposals with unresolved amounts: ${analysis.metrics.unresolvedAmountProposals}`,
    `- Outstanding native balance: ${analysis.metrics.outstandingNativeBalance}`,
    "",
    "MRR and proposed totals are provisional until reviewed against actual provider and contractual records.",
  ];
  for (const customer of analysis.customers) {
    lines.push("", `## Customer ${customer.customerId}`, "", `Review status: ${customer.reviewStatus}`);
    for (const proposal of customer.proposals) {
      lines.push(
        "",
        `- ${proposal.proposalId}: ${proposal.reviewStatus}; ${proposal.collectionMethod ?? "unknown collection"}; ${proposal.billingIntervalMonths} month(s); ${proposal.proposedItems.length} item(s); cycle ${proposal.proposedCycleAmount ?? "unresolved"}; pricing ${proposal.pricingAssessment}`,
      );
      for (const entry of proposal.issues) {
        lines.push(`  - [${entry.severity}] ${entry.code}: ${entry.message}`);
      }
    }
    for (const entry of customer.issues) {
      lines.push(`- [${entry.severity}] ${entry.code}: ${entry.message}`);
    }
  }
  if (analysis.globalIssues.length) {
    lines.push("", "## Global conflicts", "");
    for (const entry of analysis.globalIssues) {
      lines.push(`- [${entry.severity}] ${entry.code}: ${entry.message} (${entry.sourceIds.join(", ")})`);
    }
  }
  return `${lines.join("\n")}\n`;
}
