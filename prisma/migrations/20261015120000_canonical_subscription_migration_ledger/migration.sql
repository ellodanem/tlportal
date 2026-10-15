-- Phase 2B: additive audit/idempotency ledger for reviewed legacy-to-canonical
-- shadow migrations. This migration does not backfill or alter legacy billing rows.

CREATE TYPE "CanonicalMigrationStatus" AS ENUM (
  'approved',
  'in_progress',
  'completed',
  'failed_rolled_back',
  'needs_review',
  'reversed'
);

CREATE TABLE "CanonicalMigrationLedger" (
  "id" TEXT NOT NULL,
  "migrationKey" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "planFingerprint" TEXT NOT NULL,
  "status" "CanonicalMigrationStatus" NOT NULL DEFAULT 'approved',
  "approvedPlan" JSONB NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvalReason" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "targetSubscriptionId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "reconciliation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CanonicalMigrationLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalMigrationLedger_migrationKey_key"
ON "CanonicalMigrationLedger"("migrationKey");

CREATE UNIQUE INDEX "CanonicalMigrationLedger_sourceKind_sourceId_key"
ON "CanonicalMigrationLedger"("sourceKind", "sourceId");

CREATE UNIQUE INDEX "CanonicalMigrationLedger_targetSubscriptionId_key"
ON "CanonicalMigrationLedger"("targetSubscriptionId");

CREATE INDEX "CanonicalMigrationLedger_customerId_status_idx"
ON "CanonicalMigrationLedger"("customerId", "status");

CREATE INDEX "CanonicalMigrationLedger_status_updatedAt_idx"
ON "CanonicalMigrationLedger"("status", "updatedAt");

ALTER TABLE "CanonicalMigrationLedger"
ADD CONSTRAINT "CanonicalMigrationLedger_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CanonicalMigrationLedger"
ADD CONSTRAINT "CanonicalMigrationLedger_targetSubscriptionId_fkey"
FOREIGN KEY ("targetSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
