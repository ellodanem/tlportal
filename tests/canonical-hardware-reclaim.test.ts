import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { openAssignmentJoinBlocker } from "../lib/domain/canonical-hardware-reclaim";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const installed = {
  assignmentCustomerId: "cust-a",
  expectedCustomerId: "cust-a",
  endDate: null,
  assignmentStatus: "active",
  linkedItemStatus: null as string | null,
};

test("an unlinked installation can join a new agreement for the same customer", () => {
  assert.equal(openAssignmentJoinBlocker(installed), null);
});

test("a tracker left on an ended or canceled service can join a new agreement", () => {
  assert.equal(openAssignmentJoinBlocker({ ...installed, linkedItemStatus: "ended" }), null);
  assert.equal(openAssignmentJoinBlocker({ ...installed, linkedItemStatus: "canceled" }), null);
});

test("a tracker on a live service cannot be stolen by a new agreement", () => {
  const blocker = openAssignmentJoinBlocker({ ...installed, linkedItemStatus: "active" });
  assert.equal(blocker?.code, "ASSIGNMENT_CONFLICT");
  assert.match(blocker?.message ?? "", /live service/);
});

test("a tracker installed for another customer cannot join", () => {
  const blocker = openAssignmentJoinBlocker({ ...installed, expectedCustomerId: "cust-b" });
  assert.equal(blocker?.code, "CROSS_CUSTOMER_ASSIGNMENT");
});

test("a closed assignment cannot join", () => {
  assert.equal(openAssignmentJoinBlocker({ ...installed, assignmentStatus: "cancelled" })?.code, "ASSIGNMENT_CLOSED");
  assert.equal(openAssignmentJoinBlocker({ ...installed, endDate: new Date("2026-11-27T00:00:00.000Z") })?.code, "ASSIGNMENT_CLOSED");
});

test("new subscription and add-service reuse ended-agreement hardware", async () => {
  const [onboardingPage, onboardingForm, addService, assign] = await Promise.all([
    read("app/admin/subscriptions/canonical/new/page.tsx"),
    read("components/admin/canonical-customer-onboarding-form.tsx"),
    read("lib/services/subscription-service-addition-service.ts"),
    read("lib/services/canonical-subscription-application-service.ts"),
  ]);
  assert.match(onboardingPage, /reclaimableOpenAssignmentWhere/);
  assert.match(onboardingForm, /hardwareDevices/);
  assert.match(onboardingForm, /ended agreement/);
  assert.match(addService, /reclaimableOpenAssignmentWhere/);
  assert.match(assign, /openAssignmentJoinBlocker/);
});
