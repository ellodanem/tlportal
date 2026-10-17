-- Phase 4A: durable, single-subscription authority transfer for the first
-- manual-billing pilot. This is additive and does not activate existing rows.

CREATE TYPE "CanonicalManualPilotStatus" AS ENUM (
  'approved',
  'in_progress',
  'active',
  'failed_rolled_back',
  'reversed',
  'needs_review'
);

CREATE TABLE "CanonicalManualPilotActivation" (
  "id" TEXT NOT NULL,
  "activationKey" TEXT NOT NULL,
  "authorizationId" TEXT NOT NULL,
  "migrationLedgerId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "targetSubscriptionId" TEXT NOT NULL,
  "legacyScheduleId" TEXT NOT NULL,
  "canonicalScheduleId" TEXT,
  "status" "CanonicalManualPilotStatus" NOT NULL DEFAULT 'approved',
  "sourceStateFingerprint" TEXT NOT NULL,
  "proposalFingerprint" TEXT NOT NULL,
  "approvalFingerprint" TEXT NOT NULL,
  "cutoverPeriodStart" DATE NOT NULL,
  "recurringAmount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "billingIntervalMonths" INTEGER NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvalReason" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "reconciliation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CanonicalManualPilotActivation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CanonicalManualPilotActivation_interval_check"
    CHECK ("billingIntervalMonths" IN (1, 3, 6, 12)),
  CONSTRAINT "CanonicalManualPilotActivation_amount_check"
    CHECK ("recurringAmount" >= 0)
);

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_activationKey_key"
ON "CanonicalManualPilotActivation"("activationKey");

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_authorizationId_key"
ON "CanonicalManualPilotActivation"("authorizationId");

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_migrationLedgerId_key"
ON "CanonicalManualPilotActivation"("migrationLedgerId");

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_targetSubscriptionId_key"
ON "CanonicalManualPilotActivation"("targetSubscriptionId");

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_legacyScheduleId_key"
ON "CanonicalManualPilotActivation"("legacyScheduleId");

CREATE UNIQUE INDEX "CanonicalManualPilotActivation_canonicalScheduleId_key"
ON "CanonicalManualPilotActivation"("canonicalScheduleId");

CREATE INDEX "CanonicalManualPilotActivation_customerId_status_idx"
ON "CanonicalManualPilotActivation"("customerId", "status");

CREATE INDEX "CanonicalManualPilotActivation_status_updatedAt_idx"
ON "CanonicalManualPilotActivation"("status", "updatedAt");

ALTER TABLE "CanonicalManualPilotActivation"
ADD CONSTRAINT "CanonicalManualPilotActivation_migrationLedgerId_fkey"
FOREIGN KEY ("migrationLedgerId") REFERENCES "CanonicalMigrationLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CanonicalManualPilotActivation"
ADD CONSTRAINT "CanonicalManualPilotActivation_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CanonicalManualPilotActivation"
ADD CONSTRAINT "CanonicalManualPilotActivation_targetSubscriptionId_fkey"
FOREIGN KEY ("targetSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CanonicalManualPilotActivation"
ADD CONSTRAINT "CanonicalManualPilotActivation_legacyScheduleId_fkey"
FOREIGN KEY ("legacyScheduleId") REFERENCES "RecurringInvoiceSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CanonicalManualPilotActivation"
ADD CONSTRAINT "CanonicalManualPilotActivation_canonicalScheduleId_fkey"
FOREIGN KEY ("canonicalScheduleId") REFERENCES "RecurringInvoiceSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
