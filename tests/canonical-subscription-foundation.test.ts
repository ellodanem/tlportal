import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Prisma } from "@prisma/client";

import {
  assertSupportedSubscriptionIntervalMonths,
  DEFAULT_SUBSCRIPTION_GRACE_PERIOD_DAYS,
  isSupportedSubscriptionIntervalMonths,
  subscriptionGracePeriodDays,
} from "../lib/domain/canonical-subscription";

const migrationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20261014230000_canonical_subscription_foundation/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const fourMonthMigrationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20261019173000_four_month_canonical_terms/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("canonical billing intervals support 1, 3, 4, 6, and 12 months", () => {
  for (const interval of [1, 3, 4, 6, 12]) {
    assert.equal(isSupportedSubscriptionIntervalMonths(interval), true);
    assert.doesNotThrow(() => assertSupportedSubscriptionIntervalMonths(interval));
  }

  for (const interval of [0, 2, 5, 13, 1.5]) {
    assert.equal(isSupportedSubscriptionIntervalMonths(interval), false);
    assert.throws(
      () => assertSupportedSubscriptionIntervalMonths(interval),
      /1, 3, 4, 6, or 12 months/,
    );
  }
});

test("new canonical configurations default to a seven-day grace period", () => {
  assert.equal(DEFAULT_SUBSCRIPTION_GRACE_PERIOD_DAYS, 7);
  assert.equal(subscriptionGracePeriodDays(), 7);
  assert.equal(subscriptionGracePeriodDays(null), 7);
  assert.equal(subscriptionGracePeriodDays(14), 14);
  assert.throws(() => subscriptionGracePeriodDays(-1), /non-negative/);
  assert.throws(() => subscriptionGracePeriodDays(1.5), /whole number/);
});

test("migration leaves every existing subscription under legacy control", () => {
  assert.match(
    migrationSql,
    /ADD COLUMN "controlMode" "SubscriptionControlMode" NOT NULL DEFAULT 'legacy'/,
  );
  assert.doesNotMatch(migrationSql, /UPDATE\s+"CustomerSubscription"/i);
  assert.doesNotMatch(migrationSql, /DROP\s+(COLUMN|TABLE|TYPE)/i);
});

test("legacy Stripe subscription fields are not repurposed by the migration", () => {
  for (const field of [
    "status",
    "planTermMonths",
    "monthlyRateXcd",
    "vehicleCount",
    "stripeSubscriptionId",
    "stripeCustomerId",
    "currentPeriodStart",
    "currentPeriodEnd",
    "cancelAt",
  ]) {
    assert.doesNotMatch(migrationSql, new RegExp(`(?:ALTER|DROP)\\s+COLUMN\\s+"${field}"`, "i"));
  }
});

test("canonical dates, money, and collection dimensions use explicit database types", () => {
  assert.match(migrationSql, /"agreedAmountPerCycle" DECIMAL\(12,2\)/);
  assert.match(migrationSql, /"commercialStartDate" DATE/);
  assert.match(migrationSql, /"billingAnchorDate" DATE/);
  assert.match(migrationSql, /"nextBillingDate" DATE/);
  assert.match(
    migrationSql,
    /"billingIntervalMonths" IS NULL OR "billingIntervalMonths" IN \(1, 3, 6, 12\)/,
  );
});

test("four-month support is additive and updates every canonical rate constraint", () => {
  for (const table of ["CustomerSubscription", "SubscriptionItemRate", "SubscriptionProviderItem", "CanonicalManualPilotActivation"]) {
    assert.match(fourMonthMigrationSql, new RegExp(`ALTER TABLE "${table}"`));
  }
  assert.equal((fourMonthMigrationSql.match(/IN \(1, 3, 4, 6, 12\)/g) ?? []).length, 4);
  assert.doesNotMatch(fourMonthMigrationSql, /DELETE\s+FROM|UPDATE\s+"(?:CustomerSubscription|SubscriptionItemRate|SubscriptionProviderItem)"/i);
});

test("historical invoices and recurring schedules remain valid without attribution", () => {
  assert.match(migrationSql, /ALTER TABLE "Invoice"\s+ADD COLUMN "customerSubscriptionId" TEXT;/);
  assert.match(
    migrationSql,
    /ALTER TABLE "RecurringInvoiceSchedule"\s+ADD COLUMN "customerSubscriptionId" TEXT;/,
  );
  assert.doesNotMatch(migrationSql, /"customerSubscriptionId" TEXT NOT NULL/);
});

test("no new field can activate canonical billing implicitly", () => {
  assert.match(
    migrationSql,
    /CREATE TYPE "SubscriptionControlMode" AS ENUM \('legacy', 'shadow', 'canonical'\)/,
  );
  assert.doesNotMatch(migrationSql, /DEFAULT '(?:shadow|canonical)'/);
});

test("generated Prisma models preserve legacy fields and expose nullable attribution", () => {
  const subscription = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "CustomerSubscription",
  );
  const invoice = Prisma.dmmf.datamodel.models.find((model) => model.name === "Invoice");
  const schedule = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === "RecurringInvoiceSchedule",
  );

  assert.ok(subscription);
  assert.ok(invoice);
  assert.ok(schedule);

  for (const legacyField of [
    "status",
    "planTermMonths",
    "monthlyRateXcd",
    "vehicleCount",
    "stripeSubscriptionId",
    "stripeCustomerId",
    "currentPeriodStart",
    "currentPeriodEnd",
    "cancelAt",
  ]) {
    assert.ok(subscription.fields.some((field) => field.name === legacyField));
  }

  const controlMode = subscription.fields.find((field) => field.name === "controlMode");
  const gracePeriod = subscription.fields.find((field) => field.name === "gracePeriodDays");
  const invoiceAttribution = invoice.fields.find(
    (field) => field.name === "customerSubscriptionId",
  );
  const scheduleAttribution = schedule.fields.find(
    (field) => field.name === "customerSubscriptionId",
  );

  assert.equal(controlMode?.default, "legacy");
  assert.equal(gracePeriod?.default, 7);
  assert.equal(invoiceAttribution?.isRequired, false);
  assert.equal(scheduleAttribution?.isRequired, false);
});

test("collection and lifecycle dimensions represent manual and automatic agreements", () => {
  const collectionMethod = Prisma.dmmf.datamodel.enums.find(
    (entry) => entry.name === "SubscriptionCollectionMethod",
  );
  const lifecycle = Prisma.dmmf.datamodel.enums.find(
    (entry) => entry.name === "SubscriptionLifecycleStatus",
  );

  assert.deepEqual(
    collectionMethod?.values.map((value) => value.name),
    ["manual_invoice", "stripe_autocharge"],
  );
  assert.deepEqual(lifecycle?.values.map((value) => value.name), [
    "draft",
    "pending_activation",
    "active",
    "paused",
    "canceled",
    "ended",
  ]);
});
