import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveCustomerCollectionSummary,
  type CustomerCollectionInvoice,
} from "../lib/domain/customer-collection-summary";

function stripeInvoice(overrides: Partial<CustomerCollectionInvoice> = {}): CustomerCollectionInvoice {
  return {
    id: "stripe-invoice-1",
    source: "stripe",
    status: "paid",
    number: "TL-INV-100930",
    amount: 125,
    amountDue: 0,
    currency: "XCD",
    invoiceDate: new Date("2026-09-15T00:00:00.000Z"),
    dueDate: new Date("2026-10-15T00:00:00.000Z"),
    periodStart: new Date("2026-09-15T00:00:00.000Z"),
    periodEnd: new Date("2026-10-15T00:00:00.000Z"),
    paidAt: new Date("2026-09-16T00:00:00.000Z"),
    sentAt: null,
    receiptEmailedAt: null,
    deliveryStatus: null,
    deliveryError: null,
    hostedInvoiceUrl: "https://invoice.stripe.example/test",
    ...overrides,
  };
}

function derive(overrides: Partial<Parameters<typeof deriveCustomerCollectionSummary>[0]> = {}) {
  return deriveCustomerCollectionSummary({
    asOf: new Date("2026-10-20T12:00:00.000Z"),
    serviceRenewalDueDate: null,
    subscriptionRenewalDate: null,
    subscriptionStatuses: ["active", "current"],
    collectionHealthStatuses: ["current"],
    billingAccountStatus: "active",
    invoices: [],
    deliveries: [],
    ...overrides,
  });
}

test("an overdue renewal without a current invoice is not reported as a zero paid balance", () => {
  const result = derive({
    serviceRenewalDueDate: new Date("2026-10-15T00:00:00.000Z"),
    subscriptionRenewalDate: new Date("2026-11-15T00:00:00.000Z"),
    invoices: [stripeInvoice()],
  });

  assert.equal(result.state, "overdue");
  assert.equal(result.headline, "Payment overdue");
  assert.equal(result.outstandingAmount, 0);
  assert.match(result.detail, /no current unpaid invoice is recorded/i);
  assert.equal(result.renewalDatesDisagree, true);
  assert.equal(result.paidThrough?.toISOString(), "2026-10-15T00:00:00.000Z");
});

test("a provider past-due signal requires review instead of assuming its billed total is unpaid", () => {
  const result = derive({
    subscriptionStatuses: ["past_due"],
    invoices: [stripeInvoice({ status: "open", paidAt: null, amountDue: 125 })],
  });

  assert.equal(result.state, "failed");
  assert.equal(result.outstandingAmount, 0);
  assert.equal(result.providerBalanceRequiresReview, true);
  assert.match(result.detail, /exact balance is not recorded/i);
});

test("an open invoice is clearly outstanding even before its due date", () => {
  const result = derive({
    invoices: [stripeInvoice({ source: "native", status: "open", paidAt: null, amountDue: 125, dueDate: new Date("2026-10-25T00:00:00.000Z"), hostedInvoiceUrl: null })],
  });

  assert.equal(result.state, "outstanding");
  assert.equal(result.headline, "Payment outstanding");
  assert.equal(result.deliveryLabel, "Not recorded");
});

test("a payment covering the overdue service date remains current", () => {
  const result = derive({
    serviceRenewalDueDate: new Date("2026-10-15T00:00:00.000Z"),
    invoices: [stripeInvoice({
      invoiceDate: new Date("2026-10-15T00:00:00.000Z"),
      periodStart: new Date("2026-10-15T00:00:00.000Z"),
      periodEnd: new Date("2026-11-15T00:00:00.000Z"),
      paidAt: new Date("2026-10-15T02:00:00.000Z"),
    })],
  });

  assert.equal(result.state, "paid");
  assert.match(result.headline, /Paid through/);
});

test("native invoice delivery timestamps answer whether an invoice was sent", () => {
  const invoice: CustomerCollectionInvoice = {
    ...stripeInvoice(),
    id: "native-invoice-1",
    source: "native",
    status: "open",
    amountDue: 80,
    paidAt: null,
    dueDate: new Date("2026-10-25T00:00:00.000Z"),
    periodEnd: null,
    hostedInvoiceUrl: null,
    sentAt: new Date("2026-10-19T12:00:00.000Z"),
  };
  const result = derive({ invoices: [invoice] });

  assert.equal(result.state, "outstanding");
  assert.equal(result.deliveryLabel, "Invoice sent");
  assert.match(result.deliveryDetail, /19.*2026/);
});
