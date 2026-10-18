-- Owner-approved, application-managed legacy migration campaigns. Additive:
-- this never changes a legacy schedule, provider subscription, invoice,
-- payment, notification, or existing migration ledger.

CREATE TYPE "CanonicalMigrationCampaignStatus" AS ENUM (
  'approved',
  'executing',
  'completed',
  'completed_with_exceptions',
  'needs_review'
);

CREATE TYPE "CanonicalMigrationCampaignEntryStatus" AS ENUM (
  'approved',
  'executing',
  'migrated',
  'blocked',
  'failed',
  'skipped'
);

CREATE TABLE "CanonicalMigrationCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "CanonicalMigrationCampaignStatus" NOT NULL DEFAULT 'approved',
  "sourceAnalysisDate" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "planFingerprint" TEXT NOT NULL,
  "ownerConfirmations" JSONB NOT NULL,
  "approvalReason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "executionStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CanonicalMigrationCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CanonicalMigrationCampaignEntry" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "migrationKey" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "planFingerprint" TEXT NOT NULL,
  "approvedPlan" JSONB NOT NULL,
  "status" "CanonicalMigrationCampaignEntryStatus" NOT NULL DEFAULT 'approved',
  "migrationLedgerId" TEXT,
  "targetSubscriptionId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CanonicalMigrationCampaignEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalMigrationCampaignEntry_campaignId_proposalId_key"
  ON "CanonicalMigrationCampaignEntry"("campaignId", "proposalId");
CREATE INDEX "CanonicalMigrationCampaign_status_updatedAt_idx"
  ON "CanonicalMigrationCampaign"("status", "updatedAt");
CREATE INDEX "CanonicalMigrationCampaign_approvedById_approvedAt_idx"
  ON "CanonicalMigrationCampaign"("approvedById", "approvedAt");
CREATE INDEX "CanonicalMigrationCampaignEntry_campaignId_status_idx"
  ON "CanonicalMigrationCampaignEntry"("campaignId", "status");
CREATE INDEX "CanonicalMigrationCampaignEntry_customerId_status_idx"
  ON "CanonicalMigrationCampaignEntry"("customerId", "status");
CREATE INDEX "CanonicalMigrationCampaignEntry_migrationKey_idx"
  ON "CanonicalMigrationCampaignEntry"("migrationKey");

ALTER TABLE "CanonicalMigrationCampaign"
  ADD CONSTRAINT "CanonicalMigrationCampaign_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalMigrationCampaign"
  ADD CONSTRAINT "CanonicalMigrationCampaign_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalMigrationCampaignEntry"
  ADD CONSTRAINT "CanonicalMigrationCampaignEntry_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CanonicalMigrationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanonicalMigrationCampaignEntry"
  ADD CONSTRAINT "CanonicalMigrationCampaignEntry_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
