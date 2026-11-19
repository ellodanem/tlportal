import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHEDULED_PAYMENT_REMINDERS_ENABLED,
  customerIsDueScheduledPaymentReminder,
  customerReceivesPaymentReminders,
  paymentRemindersStatusLabel,
} from "../lib/domain/payment-reminders";

test("scheduled payment reminders are disabled for every customer", () => {
  assert.equal(SCHEDULED_PAYMENT_REMINDERS_ENABLED, false);
  assert.equal(
    customerIsDueScheduledPaymentReminder({ billingMode: "manual_legacy", paymentReminders: "on" }),
    false,
  );
  assert.equal(
    customerIsDueScheduledPaymentReminder({ billingMode: "stripe_subscription", paymentReminders: "on" }),
    false,
  );
  assert.equal(
    paymentRemindersStatusLabel({ billingMode: "manual_legacy", paymentReminders: "auto" }),
    "Reminders: Off (automatic program disabled)",
  );
});

test("auto keeps reminders off for Stripe collection even if billingMode is still manual", () => {
  assert.equal(
    customerReceivesPaymentReminders({
      billingMode: "manual_legacy",
      paymentReminders: "auto",
      stripeAutoCharge: true,
    }),
    false,
  );
  assert.equal(
    customerReceivesPaymentReminders({ billingMode: "stripe_subscription", paymentReminders: "auto" }),
    false,
  );
  assert.equal(
    customerReceivesPaymentReminders({ billingMode: "manual_legacy", paymentReminders: "auto" }),
    true,
  );
});

test("staff on/off overrides still apply to the per-customer rule", () => {
  assert.equal(
    customerReceivesPaymentReminders({ billingMode: "stripe_subscription", paymentReminders: "on" }),
    true,
  );
  assert.equal(
    customerReceivesPaymentReminders({ billingMode: "manual_legacy", paymentReminders: "off" }),
    false,
  );
});
