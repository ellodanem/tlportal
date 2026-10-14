import assert from "node:assert/strict";
import test from "node:test";

import { coordinateStripeWebhookFulfillment } from "../lib/billing/stripe-webhook-fulfillment-coordinator";

test("webhook replay does not duplicate completed critical fulfillment", async () => {
  let status: "new" | "in_progress" | "completed" | "retry_required" = "new";
  let fulfillmentCalls = 0;
  const dependencies = {
    claim: async () => {
      if (status === "completed" || status === "in_progress") {
        return { claimed: false as const, reason: status === "completed" ? "completed" as const : "in_progress" as const };
      }
      status = "in_progress";
      return { claimed: true as const };
    },
    fulfill: async () => { fulfillmentCalls += 1; },
    complete: async () => { status = "completed"; },
    retryRequired: async () => { status = "retry_required"; },
  };

  await coordinateStripeWebhookFulfillment({ id: "evt_1" }, dependencies);
  const replay = await coordinateStripeWebhookFulfillment({ id: "evt_1" }, dependencies);
  assert.equal(replay.duplicate, true);
  assert.equal(fulfillmentCalls, 1);
});

test("critical webhook failure remains retryable and completes on reconciliation", async () => {
  let status: "new" | "in_progress" | "completed" | "retry_required" = "new";
  let fail = true;
  let fulfillmentCalls = 0;
  const dependencies = {
    claim: async () => {
      if (status === "completed" || status === "in_progress") {
        return { claimed: false as const, reason: status === "completed" ? "completed" as const : "in_progress" as const };
      }
      status = "in_progress";
      return { claimed: true as const };
    },
    fulfill: async () => {
      fulfillmentCalls += 1;
      if (fail) throw new Error("invoice mirror unavailable");
    },
    complete: async () => { status = "completed"; },
    retryRequired: async () => { status = "retry_required"; },
  };

  await assert.rejects(
    coordinateStripeWebhookFulfillment({ id: "evt_2" }, dependencies),
    /invoice mirror unavailable/,
  );
  assert.equal(status, "retry_required");
  fail = false;
  await coordinateStripeWebhookFulfillment({ id: "evt_2" }, dependencies);
  assert.equal(status, "completed");
  assert.equal(fulfillmentCalls, 2);
});
