export type CustomerCollectionInvoice = {
  id: string;
  source: "native" | "stripe";
  status: string;
  number: string | null;
  amount: number;
  amountDue: number;
  currency: string;
  invoiceDate: Date;
  dueDate: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  sentAt: Date | null;
  receiptEmailedAt: Date | null;
  deliveryStatus: string | null;
  deliveryError: string | null;
  hostedInvoiceUrl: string | null;
};

export type CustomerCollectionDelivery = {
  invoiceId: string | null;
  status: string;
  channel: string;
  sentAt: Date | null;
  createdAt: Date;
};

export type CustomerCollectionSummary = {
  state: "failed" | "overdue" | "outstanding" | "paid" | "upcoming" | "no_activity";
  tone: "danger" | "warning" | "success" | "neutral";
  headline: string;
  detail: string;
  outstandingAmount: number;
  /** A provider signal exists, but TL Portal cannot confirm its remaining balance. */
  providerBalanceRequiresReview: boolean;
  currency: string;
  latestInvoice: CustomerCollectionInvoice | null;
  lastPaymentAt: Date | null;
  paidThrough: Date | null;
  deliveryLabel: string;
  deliveryDetail: string;
  serviceRenewalDueDate: Date | null;
  subscriptionRenewalDate: Date | null;
  renewalDatesDisagree: boolean;
};

const NATIVE_OPEN = new Set(["open", "partially_paid", "overdue"]);
const PROVIDER_OPEN = new Set(["open", "past_due", "uncollectible"]);
const FAILED_SUBSCRIPTION = new Set(["past_due", "unpaid"]);

function day(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  return values.filter((value): value is Date => value != null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-EC", { style: "currency", currency: currency.toUpperCase() }).format(value);
}

function deliveryForInvoice(
  invoice: CustomerCollectionInvoice | null,
  deliveries: CustomerCollectionDelivery[],
): Pick<CustomerCollectionSummary, "deliveryLabel" | "deliveryDetail"> {
  if (!invoice) {
    return { deliveryLabel: "No invoice to send", deliveryDetail: "No current invoice has been recorded." };
  }

  const related = deliveries
    .filter((delivery) => delivery.invoiceId === invoice.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const failed = related.find((delivery) => delivery.status === "failed");
  if (invoice.deliveryStatus === "failed" || failed) {
    return {
      deliveryLabel: "Delivery failed",
      deliveryDetail: invoice.deliveryError ?? `The ${failed?.channel ?? "invoice"} notice needs attention.`,
    };
  }

  if (invoice.receiptEmailedAt) {
    return {
      deliveryLabel: "Receipt emailed",
      deliveryDetail: `TL Portal recorded the receipt email on ${invoice.receiptEmailedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}.`,
    };
  }

  const sentDelivery = related.find((delivery) => delivery.status === "sent");
  const sentAt = invoice.sentAt ?? sentDelivery?.sentAt ?? null;
  if (sentAt) {
    return {
      deliveryLabel: "Invoice sent",
      deliveryDetail: `Sent ${sentAt.toLocaleDateString(undefined, { dateStyle: "medium" })}${sentDelivery ? ` by ${sentDelivery.channel}` : ""}.`,
    };
  }

  if (invoice.source === "stripe" && invoice.hostedInvoiceUrl) {
    return {
      deliveryLabel: "Delivery not tracked",
      deliveryDetail: "The invoice is available in Stripe, but TL Portal has no record that it reached the customer.",
    };
  }

  return invoice.status.toLowerCase() === "draft"
    ? { deliveryLabel: "Not sent", deliveryDetail: "This invoice is still a draft." }
    : { deliveryLabel: "Not recorded", deliveryDetail: "TL Portal has no successful delivery timestamp for this invoice." };
}

export function deriveCustomerCollectionSummary(input: {
  asOf: Date;
  serviceRenewalDueDate: Date | null;
  subscriptionRenewalDate: Date | null;
  subscriptionStatuses: string[];
  collectionHealthStatuses: string[];
  billingAccountStatus: string | null;
  invoices: CustomerCollectionInvoice[];
  deliveries: CustomerCollectionDelivery[];
}): CustomerCollectionSummary {
  const invoices = [...input.invoices].sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());
  const latestInvoice = invoices[0] ?? null;
  const nativeOpen = invoices.filter((invoice) => invoice.source === "native" && NATIVE_OPEN.has(invoice.status.toLowerCase()) && invoice.amountDue > 0);
  const providerOpen = invoices.filter((invoice) => invoice.source === "stripe" && PROVIDER_OPEN.has(invoice.status.toLowerCase()));
  // Provider invoices expose their billed total, not a verified remaining balance. Never
  // turn that into accounts-receivable in the customer summary.
  const outstandingAmount = nativeOpen.reduce((total, invoice) => total + invoice.amountDue, 0);
  const providerBalanceRequiresReview = providerOpen.length > 0;
  const currency = nativeOpen[0]?.currency ?? latestInvoice?.currency ?? "XCD";
  const lastPaymentAt = latestDate(invoices.map((invoice) => invoice.paidAt));
  const paidThrough = latestDate(invoices.filter((invoice) => invoice.paidAt).map((invoice) => invoice.periodEnd));
  const statusSignals = [...input.subscriptionStatuses, input.billingAccountStatus ?? ""].map((status) => status.toLowerCase());
  const collectionPastDue = input.collectionHealthStatuses.some((status) => ["past_due", "action_required"].includes(status.toLowerCase()));
  const failed = statusSignals.some((status) => FAILED_SUBSCRIPTION.has(status))
    || providerOpen.some((invoice) => invoice.status.toLowerCase() === "uncollectible");
  const nativeOverdue = nativeOpen.some((invoice) => invoice.status.toLowerCase() === "overdue" || (invoice.dueDate != null && day(invoice.dueDate) < day(input.asOf)));
  const serviceRenewalOverdue = input.serviceRenewalDueDate != null && day(input.serviceRenewalDueDate) < day(input.asOf);
  const serviceRenewalDueToday = input.serviceRenewalDueDate != null && day(input.serviceRenewalDueDate) === day(input.asOf);
  const paymentCoversServiceRenewal = input.serviceRenewalDueDate != null && invoices.some((invoice) =>
    invoice.paidAt != null
    && ((invoice.periodEnd != null && day(invoice.periodEnd) > day(input.serviceRenewalDueDate!))
      || (invoice.periodStart != null && day(invoice.periodStart) >= day(input.serviceRenewalDueDate!))));
  const renewalUnpaid = (serviceRenewalOverdue || serviceRenewalDueToday) && !paymentCoversServiceRenewal;
  const renewalDatesDisagree = input.serviceRenewalDueDate != null
    && input.subscriptionRenewalDate != null
    && day(input.serviceRenewalDueDate) !== day(input.subscriptionRenewalDate);
  const delivery = deliveryForInvoice(nativeOpen.sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime())[0] ?? latestInvoice, input.deliveries);

  if (failed) {
    return {
      state: "failed",
      tone: "danger",
      headline: outstandingAmount > 0 ? "Payment failed" : "Subscription requires billing review",
      detail: outstandingAmount > 0
        ? `${money(outstandingAmount, currency)} remains outstanding. Review the failed card payment or invoice.`
        : "The billing provider reports a past-due or unpaid subscription. The exact balance is not recorded here.",
      outstandingAmount,
      providerBalanceRequiresReview,
      currency,
      latestInvoice,
      lastPaymentAt,
      paidThrough,
      ...delivery,
      serviceRenewalDueDate: input.serviceRenewalDueDate,
      subscriptionRenewalDate: input.subscriptionRenewalDate,
      renewalDatesDisagree,
    };
  }

  if (nativeOverdue || renewalUnpaid || collectionPastDue) {
    const noOpenInvoice = nativeOpen.length === 0;
    return {
      state: "overdue",
      tone: "danger",
      headline: "Payment overdue",
      detail: noOpenInvoice
        ? renewalUnpaid
          ? "A service renewal is overdue, but no current unpaid invoice is recorded. EC$0 would not mean paid in this case."
          : "Collection records are past due, but no current unpaid invoice is recorded. The exact balance still needs to be reconciled."
        : `${money(outstandingAmount, currency)} is overdue.`,
      outstandingAmount,
      providerBalanceRequiresReview,
      currency,
      latestInvoice,
      lastPaymentAt,
      paidThrough,
      ...delivery,
      serviceRenewalDueDate: input.serviceRenewalDueDate,
      subscriptionRenewalDate: input.subscriptionRenewalDate,
      renewalDatesDisagree,
    };
  }

  if (nativeOpen.length > 0) {
    return {
      state: "outstanding",
      tone: "warning",
      headline: "Payment outstanding",
      detail: `${money(outstandingAmount, currency)} is awaiting payment.`,
      outstandingAmount,
      providerBalanceRequiresReview,
      currency,
      latestInvoice,
      lastPaymentAt,
      paidThrough,
      ...delivery,
      serviceRenewalDueDate: input.serviceRenewalDueDate,
      subscriptionRenewalDate: input.subscriptionRenewalDate,
      renewalDatesDisagree,
    };
  }

  if (lastPaymentAt) {
    return {
      state: "paid",
      tone: "success",
      headline: paidThrough ? `Paid through ${paidThrough.toLocaleDateString(undefined, { dateStyle: "medium" })}` : "Latest invoice paid",
      detail: `The most recent recorded payment was ${lastPaymentAt.toLocaleDateString(undefined, { dateStyle: "medium" })}.`,
      outstandingAmount: 0,
      providerBalanceRequiresReview,
      currency,
      latestInvoice,
      lastPaymentAt,
      paidThrough,
      ...delivery,
      serviceRenewalDueDate: input.serviceRenewalDueDate,
      subscriptionRenewalDate: input.subscriptionRenewalDate,
      renewalDatesDisagree,
    };
  }

  const futureRenewal = input.serviceRenewalDueDate ?? input.subscriptionRenewalDate;
  return {
    state: futureRenewal ? "upcoming" : "no_activity",
    tone: "neutral",
    headline: futureRenewal ? "No payment recorded yet" : "No billing activity",
    detail: futureRenewal
      ? `The next recorded renewal is ${futureRenewal.toLocaleDateString(undefined, { dateStyle: "medium" })}.`
      : "No invoice or payment has been recorded for this customer.",
    outstandingAmount: 0,
    providerBalanceRequiresReview,
    currency,
    latestInvoice,
    lastPaymentAt,
    paidThrough,
    ...delivery,
    serviceRenewalDueDate: input.serviceRenewalDueDate,
    subscriptionRenewalDate: input.subscriptionRenewalDate,
    renewalDatesDisagree,
  };
}
