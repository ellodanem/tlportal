-- Add the established four-month commercial cadence without changing any
-- existing subscription, schedule, invoice, payment, or provider record.

ALTER TABLE "CustomerSubscription"
  DROP CONSTRAINT IF EXISTS "CustomerSubscription_billingIntervalMonths_check",
  ADD CONSTRAINT "CustomerSubscription_billingIntervalMonths_check"
    CHECK ("billingIntervalMonths" IS NULL OR "billingIntervalMonths" IN (1, 3, 4, 6, 12));

ALTER TABLE "SubscriptionItemRate"
  DROP CONSTRAINT IF EXISTS "SubscriptionItemRate_billingIntervalMonths_check",
  ADD CONSTRAINT "SubscriptionItemRate_billingIntervalMonths_check"
    CHECK ("billingIntervalMonths" IN (1, 3, 4, 6, 12));

ALTER TABLE "SubscriptionProviderItem"
  DROP CONSTRAINT IF EXISTS "SubscriptionProviderItem_billingIntervalMonths_check",
  ADD CONSTRAINT "SubscriptionProviderItem_billingIntervalMonths_check"
    CHECK ("billingIntervalMonths" IN (1, 3, 4, 6, 12));

ALTER TABLE "CanonicalManualPilotActivation"
  DROP CONSTRAINT IF EXISTS "CanonicalManualPilotActivation_interval_check",
  ADD CONSTRAINT "CanonicalManualPilotActivation_interval_check"
    CHECK ("billingIntervalMonths" IN (1, 3, 4, 6, 12));
