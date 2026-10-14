import assert from "node:assert/strict";
import test from "node:test";

import {
  coordinateRecurringInvoiceGeneration,
  type RecurringInvoiceCommitResult,
} from "../lib/billing/recurring-invoice-coordinator";

type DeliveryState = "sending" | "sent" | "failed" | "not_requested";

class FakeRecurringStore {
  invoice: { id: string; delivery: DeliveryState; attempts: number } | null = null;
  invoiceCreates = 0;
  scheduleAdvances = 0;
  deliveryCalls = 0;
  failNextCommit = false;
  failNextDelivery = false;
  throwNextDelivery = false;

  private transactionTail: Promise<void> = Promise.resolve();

  async commit(): Promise<RecurringInvoiceCommitResult> {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error("transaction rolled back");
      }

      if (!this.invoice) {
        this.invoiceCreates += 1;
        this.scheduleAdvances += 1;
        this.invoice = { id: "invoice-1", delivery: "sending", attempts: 1 };
        return {
          kind: "invoice",
          invoiceId: this.invoice.id,
          created: true,
          shouldDeliver: true,
          to: "billing@example.test",
          greetingName: "Customer",
        };
      }

      const shouldDeliver = this.invoice.delivery === "failed";
      if (shouldDeliver) {
        this.invoice.delivery = "sending";
        this.invoice.attempts += 1;
      }
      return {
        kind: "invoice",
        invoiceId: this.invoice.id,
        created: false,
        shouldDeliver,
        to: "billing@example.test",
        greetingName: "Customer",
      };
    } finally {
      release();
    }
  }

  async deliver(): Promise<{ ok: true } | { error: string }> {
    this.deliveryCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (this.throwNextDelivery) {
      this.throwNextDelivery = false;
      throw new Error("SMTP connection dropped");
    }
    if (this.failNextDelivery) {
      this.failNextDelivery = false;
      return { error: "PDF build failed" };
    }
    return { ok: true };
  }

  async deliverySucceeded(): Promise<void> {
    assert.ok(this.invoice);
    this.invoice.delivery = "sent";
  }

  async deliveryFailed(): Promise<void> {
    assert.ok(this.invoice);
    this.invoice.delivery = "failed";
  }

  run() {
    return coordinateRecurringInvoiceGeneration({
      commit: () => this.commit(),
      deliver: () => this.deliver(),
      deliverySucceeded: () => this.deliverySucceeded(),
      deliveryFailed: () => this.deliveryFailed(),
      now: () => new Date("2026-10-15T12:00:00.000Z"),
    });
  }
}

test("concurrent recurring executions create and deliver one invoice", async () => {
  const store = new FakeRecurringStore();

  const results = await Promise.all(Array.from({ length: 12 }, () => store.run()));

  assert.equal(store.invoiceCreates, 1);
  assert.equal(store.scheduleAdvances, 1);
  assert.equal(store.deliveryCalls, 1);
  assert.equal(results.filter((result) => !result.skipped && result.created).length, 1);
  assert.equal(store.invoice?.delivery, "sent");
});

test("a PDF or email failure keeps one invoice and retries delivery against it", async () => {
  const store = new FakeRecurringStore();
  store.failNextDelivery = true;

  const failed = await store.run();
  assert.equal(failed.skipped, false);
  if (!failed.skipped) {
    assert.equal(failed.created, true);
    assert.equal(failed.emailed, false);
    assert.equal(failed.emailError, "PDF build failed");
  }
  assert.equal(store.invoiceCreates, 1);
  assert.equal(store.scheduleAdvances, 1);
  assert.equal(store.invoice?.delivery, "failed");

  const retried = await store.run();
  assert.equal(retried.skipped, false);
  if (!retried.skipped) {
    assert.equal(retried.invoiceId, "invoice-1");
    assert.equal(retried.created, false);
    assert.equal(retried.emailed, true);
  }
  assert.equal(store.invoiceCreates, 1);
  assert.equal(store.scheduleAdvances, 1);
  assert.equal(store.invoice?.attempts, 2);
  assert.equal(store.invoice?.delivery, "sent");
});

test("a failed atomic commit creates nothing and a retry creates one invoice", async () => {
  const store = new FakeRecurringStore();
  store.failNextCommit = true;

  await assert.rejects(store.run(), /transaction rolled back/);
  assert.equal(store.invoiceCreates, 0);
  assert.equal(store.scheduleAdvances, 0);

  const retried = await store.run();
  assert.equal(retried.skipped, false);
  if (!retried.skipped) assert.equal(retried.created, true);
  assert.equal(store.invoiceCreates, 1);
  assert.equal(store.scheduleAdvances, 1);
});

test("a thrown delivery error is recorded and retries the committed invoice", async () => {
  const store = new FakeRecurringStore();
  store.throwNextDelivery = true;

  const failed = await store.run();
  assert.equal(failed.skipped, false);
  if (!failed.skipped) {
    assert.equal(failed.created, true);
    assert.equal(failed.emailError, "SMTP connection dropped");
  }
  assert.equal(store.invoiceCreates, 1);
  assert.equal(store.scheduleAdvances, 1);
  assert.equal(store.invoice?.delivery, "failed");

  const retried = await store.run();
  assert.equal(retried.skipped, false);
  if (!retried.skipped) {
    assert.equal(retried.created, false);
    assert.equal(retried.emailed, true);
  }
  assert.equal(store.invoiceCreates, 1);
  assert.equal(store.scheduleAdvances, 1);
});

test("a missing recipient records delivery failure without creating another invoice", async () => {
  let failedMessage: string | null = null;
  let deliveryCalls = 0;

  const result = await coordinateRecurringInvoiceGeneration({
    commit: async () => ({
      kind: "invoice",
      invoiceId: "invoice-1",
      created: true,
      shouldDeliver: true,
      to: null,
      greetingName: "Customer",
    }),
    deliver: async () => {
      deliveryCalls += 1;
      return { ok: true };
    },
    deliverySucceeded: async () => undefined,
    deliveryFailed: async (_invoiceId, message) => {
      failedMessage = message;
    },
  });

  assert.equal(result.skipped, false);
  assert.equal(deliveryCalls, 0);
  assert.equal(failedMessage, "No recipient email on schedule or customer.");
});
