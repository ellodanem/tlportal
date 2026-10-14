import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutCompletionRequiresReconciliation,
  coordinateStripeCheckoutOperation,
  type CheckoutOperationSnapshot,
  type CheckoutProviderSession,
} from "../lib/billing/stripe-checkout-operation-coordinator";

class FakeCheckoutSystem {
  operation: CheckoutOperationSnapshot = {
    id: "operation-1",
    operationKey: "logical-operation-1",
    customerSubscriptionId: "local-subscription-1",
    providerReference: null,
    attemptCount: 0,
    lastAttemptAt: null,
  };
  sessions = new Map<string, CheckoutProviderSession>();
  idempotency = new Map<string, string>();
  providerCreates = 0;
  beginAttempts = 0;
  retryCodes: string[] = [];
  supersededProviderReference: string | null = null;
  timeoutAfterProviderSuccess = false;

  dependencies() {
    return {
      prepare: async () => ({
        operation: { ...this.operation },
        supersededProviderReference: this.supersededProviderReference,
      }),
      replaceExpired: async () => {
        this.operation = {
          ...this.operation,
          id: "operation-2",
          operationKey: "logical-operation-2",
          providerReference: null,
          attemptCount: 0,
        };
        return { ...this.operation };
      },
      beginAttempt: async () => {
        this.beginAttempts += 1;
        this.operation.attemptCount += 1;
        this.operation.lastAttemptAt = new Date("2026-10-14T12:00:00.000Z");
      },
      retrieveSession: async (id: string) => {
        const session = this.sessions.get(id);
        if (!session) throw new Error("Session not found");
        return session;
      },
      recoverSession: async (operationKey: string) =>
        [...this.sessions.values()].find(
          (session) => this.idempotency.get(`operation:${operationKey}`) === session.id,
        ) ?? null,
      createSession: async (idempotencyKey: string, operationKey: string) => {
        const priorId = this.idempotency.get(idempotencyKey);
        if (priorId) return this.sessions.get(priorId)!;
        this.providerCreates += 1;
        const session: CheckoutProviderSession = {
          id: `cs_${this.providerCreates}`,
          status: "open",
          url: `https://checkout.test/${this.providerCreates}`,
          subscriptionReference: null,
        };
        this.sessions.set(session.id, session);
        this.idempotency.set(idempotencyKey, session.id);
        this.idempotency.set(`operation:${operationKey}`, session.id);
        if (this.timeoutAfterProviderSuccess) {
          this.timeoutAfterProviderSuccess = false;
          throw new Error("request timed out");
        }
        return session;
      },
      expireSession: async (id: string) => {
        const session = this.sessions.get(id);
        if (!session) throw new Error("Session not found");
        if (session.status === "open") session.status = "expired";
        return session;
      },
      recordProviderSession: async (_operationId: string, session: CheckoutProviderSession) => {
        this.operation.providerReference = session.id;
      },
      markRetryRequired: async (_operationId: string, code: string) => {
        this.retryCodes.push(code);
      },
      now: () => new Date("2026-10-14T12:05:00.000Z"),
    };
  }

  run() {
    return coordinateStripeCheckoutOperation(this.dependencies());
  }
}

test("repeated and concurrent Checkout submissions create one provider Session", async () => {
  const system = new FakeCheckoutSystem();
  const results = await Promise.all(Array.from({ length: 10 }, () => system.run()));
  assert.equal(system.providerCreates, 1);
  assert.ok(results.every((result) => result.ok));
  assert.equal(new Set(results.map((result) => result.ok ? result.sessionId : "error")).size, 1);
});

test("an existing valid Checkout Session is reused", async () => {
  const system = new FakeCheckoutSystem();
  const first = await system.run();
  const second = await system.run();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.reused, true);
  assert.equal(system.providerCreates, 1);
});

test("a timeout after provider success recovers the existing Session", async () => {
  const system = new FakeCheckoutSystem();
  system.timeoutAfterProviderSuccess = true;
  const timedOut = await system.run();
  assert.equal(timedOut.ok, false);
  assert.deepEqual(system.retryCodes, ["PROVIDER_REQUEST_UNCERTAIN"]);

  const recovered = await system.run();
  assert.equal(recovered.ok, true);
  if (recovered.ok) assert.equal(recovered.reused, true);
  assert.equal(system.providerCreates, 1);
});

test("retrying a failed provider request retains the logical idempotency key", async () => {
  const system = new FakeCheckoutSystem();
  system.timeoutAfterProviderSuccess = true;
  await system.run();
  const operationKey = system.operation.operationKey;
  await system.run();
  assert.equal(system.operation.operationKey, operationKey);
  assert.equal(system.providerCreates, 1);
});

test("an old uncertain request is not recreated outside the safe provider window", async () => {
  const system = new FakeCheckoutSystem();
  system.operation.attemptCount = 1;
  system.operation.lastAttemptAt = new Date("2026-10-13T12:00:00.000Z");
  const result = await system.run();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.conflict, true);
  assert.deepEqual(system.retryCodes, ["IDEMPOTENCY_WINDOW_EXPIRED"]);
  assert.equal(system.providerCreates, 0);
});

test("a superseded Session that completed is surfaced as a conflict", async () => {
  const system = new FakeCheckoutSystem();
  const completed: CheckoutProviderSession = {
    id: "cs_old",
    status: "complete",
    url: null,
    subscriptionReference: "sub_old",
  };
  system.sessions.set(completed.id, completed);
  system.supersededProviderReference = completed.id;
  const result = await system.run();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.conflict, true);
  assert.deepEqual(system.retryCodes, ["SUPERSEDED_CHECKOUT_COMPLETED"]);
  assert.equal(system.providerCreates, 0);
});

test("late completion disposition requires reconciliation instead of silent discard", () => {
  assert.equal(
    checkoutCompletionRequiresReconciliation({
      operationWasSuperseded: true,
      anotherActiveSubscriptionExists: false,
    }),
    true,
  );
  assert.equal(
    checkoutCompletionRequiresReconciliation({
      operationWasSuperseded: false,
      anotherActiveSubscriptionExists: true,
    }),
    true,
  );
});
