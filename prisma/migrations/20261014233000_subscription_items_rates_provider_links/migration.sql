-- Phase 1A2: canonical subscription items, effective-dated rates, provider history,
-- and immutable invoice service attribution. Additive only; no legacy rows are linked.

CREATE TYPE "SubscriptionItemStatus" AS ENUM ('draft', 'pending_activation', 'active', 'paused', 'ended', 'canceled');
CREATE TYPE "SubscriptionRateClassification" AS ENUM ('standard', 'negotiated');

CREATE TABLE "SubscriptionItem" (
  "id" TEXT NOT NULL,
  "customerSubscriptionId" TEXT NOT NULL,
  "label" TEXT,
  "status" "SubscriptionItemStatus" NOT NULL DEFAULT 'draft',
  "serviceActivatedDate" DATE,
  "billingEffectiveFrom" DATE,
  "billingEffectiveUntil" DATE,
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  "predecessorItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionItem_billingEffectiveRange_check"
    CHECK ("billingEffectiveUntil" IS NULL OR "billingEffectiveFrom" IS NULL OR "billingEffectiveUntil" > "billingEffectiveFrom")
);

CREATE TABLE "SubscriptionItemRate" (
  "id" TEXT NOT NULL,
  "subscriptionItemId" TEXT NOT NULL,
  "billingIntervalMonths" INTEGER NOT NULL,
  "agreedAmountPerCycle" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveUntil" DATE,
  "classification" "SubscriptionRateClassification" NOT NULL DEFAULT 'standard',
  "changeReason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionItemRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionItemRate_billingIntervalMonths_check"
    CHECK ("billingIntervalMonths" IN (1, 3, 6, 12)),
  CONSTRAINT "SubscriptionItemRate_agreedAmountPerCycle_check"
    CHECK ("agreedAmountPerCycle" >= 0),
  CONSTRAINT "SubscriptionItemRate_currency_check"
    CHECK (char_length("currency") = 3),
  CONSTRAINT "SubscriptionItemRate_effectiveRange_check"
    CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom")
);

CREATE TABLE "SubscriptionProviderLink" (
  "id" TEXT NOT NULL,
  "customerSubscriptionId" TEXT NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "externalSubscriptionId" TEXT NOT NULL,
  "providerStatus" TEXT,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionProviderLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionProviderLink_activeRange_check"
    CHECK ("endedAt" IS NULL OR "endedAt" > "activatedAt")
);

CREATE TABLE "SubscriptionProviderItem" (
  "id" TEXT NOT NULL,
  "subscriptionProviderLinkId" TEXT NOT NULL,
  "externalSubscriptionItemId" TEXT NOT NULL,
  "externalPriceId" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "billingIntervalMonths" INTEGER NOT NULL,
  "agreedAmountPerCycle" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "rateGroupFingerprint" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionProviderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionProviderItem_billingIntervalMonths_check"
    CHECK ("billingIntervalMonths" IN (1, 3, 6, 12)),
  CONSTRAINT "SubscriptionProviderItem_agreedAmountPerCycle_check"
    CHECK ("agreedAmountPerCycle" >= 0),
  CONSTRAINT "SubscriptionProviderItem_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "SubscriptionProviderItem_currency_check"
    CHECK (char_length("currency") = 3)
);

CREATE TABLE "InvoiceServiceSnapshot" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "invoiceLineItemId" TEXT,
  "subscriptionItemId" TEXT,
  "subscriptionItemRateId" TEXT,
  "serviceLabelSnapshot" TEXT,
  "agreedAmountPerCycleSnapshot" DECIMAL(12,2),
  "billedAmount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "servicePeriodStart" DATE,
  "servicePeriodEnd" DATE,
  "providerInvoiceLineReference" TEXT,
  "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
  "allocationNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceServiceSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceServiceSnapshot_agreedAmount_check"
    CHECK ("agreedAmountPerCycleSnapshot" IS NULL OR "agreedAmountPerCycleSnapshot" >= 0),
  CONSTRAINT "InvoiceServiceSnapshot_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "InvoiceServiceSnapshot_currency_check"
    CHECK (char_length("currency") = 3),
  CONSTRAINT "InvoiceServiceSnapshot_servicePeriod_check"
    CHECK ("servicePeriodEnd" IS NULL OR "servicePeriodStart" IS NULL OR "servicePeriodEnd" > "servicePeriodStart")
);

ALTER TABLE "ServiceAssignment"
ADD COLUMN "subscriptionItemId" TEXT;

ALTER TABLE "BillingInvoice"
ADD COLUMN "customerSubscriptionId" TEXT,
ADD COLUMN "subscriptionProviderLinkId" TEXT;

CREATE UNIQUE INDEX "SubscriptionItem_predecessorItemId_key"
ON "SubscriptionItem"("predecessorItemId");

CREATE INDEX "SubscriptionItem_customerSubscriptionId_status_idx"
ON "SubscriptionItem"("customerSubscriptionId", "status");

CREATE INDEX "SubscriptionItemRate_subscriptionItemId_billingIntervalMonths_effectiveFrom_idx"
ON "SubscriptionItemRate"("subscriptionItemId", "billingIntervalMonths", "effectiveFrom");

CREATE INDEX "SubscriptionItemRate_createdById_idx"
ON "SubscriptionItemRate"("createdById");

CREATE UNIQUE INDEX "SubscriptionProviderLink_provider_externalSubscriptionId_key"
ON "SubscriptionProviderLink"("provider", "externalSubscriptionId");

CREATE INDEX "SubscriptionProviderLink_customerSubscriptionId_provider_idx"
ON "SubscriptionProviderLink"("customerSubscriptionId", "provider");

CREATE UNIQUE INDEX "SubscriptionProviderItem_externalSubscriptionItemId_key"
ON "SubscriptionProviderItem"("externalSubscriptionItemId");

CREATE UNIQUE INDEX "SubscriptionProviderItem_subscriptionProviderLinkId_rateGroupFingerprint_key"
ON "SubscriptionProviderItem"("subscriptionProviderLinkId", "rateGroupFingerprint");

CREATE INDEX "SubscriptionProviderItem_externalPriceId_idx"
ON "SubscriptionProviderItem"("externalPriceId");

CREATE INDEX "InvoiceServiceSnapshot_invoiceId_idx"
ON "InvoiceServiceSnapshot"("invoiceId");

CREATE INDEX "InvoiceServiceSnapshot_invoiceLineItemId_idx"
ON "InvoiceServiceSnapshot"("invoiceLineItemId");

CREATE INDEX "InvoiceServiceSnapshot_subscriptionItemId_idx"
ON "InvoiceServiceSnapshot"("subscriptionItemId");

CREATE INDEX "InvoiceServiceSnapshot_subscriptionItemRateId_idx"
ON "InvoiceServiceSnapshot"("subscriptionItemRateId");

CREATE INDEX "InvoiceServiceSnapshot_providerInvoiceLineReference_idx"
ON "InvoiceServiceSnapshot"("providerInvoiceLineReference");

CREATE INDEX "ServiceAssignment_subscriptionItemId_idx"
ON "ServiceAssignment"("subscriptionItemId");

CREATE INDEX "BillingInvoice_customerSubscriptionId_idx"
ON "BillingInvoice"("customerSubscriptionId");

CREATE INDEX "BillingInvoice_subscriptionProviderLinkId_idx"
ON "BillingInvoice"("subscriptionProviderLinkId");

-- Nullable legacy assignments remain unaffected; future canonical assignments get one open hardware link.
CREATE UNIQUE INDEX "ServiceAssignment_one_open_subscription_item_idx"
ON "ServiceAssignment"("subscriptionItemId")
WHERE "subscriptionItemId" IS NOT NULL AND "endDate" IS NULL AND "status" <> 'cancelled';

-- Preserve provider history while preventing competing open links for one provider.
CREATE UNIQUE INDEX "SubscriptionProviderLink_one_open_provider_idx"
ON "SubscriptionProviderLink"("customerSubscriptionId", "provider")
WHERE "endedAt" IS NULL;

-- Half-open [effectiveFrom, effectiveUntil) periods cannot overlap for one item and billing basis.
-- Requires PostgreSQL btree_gist; deployment must verify extension privileges in an isolated database.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "SubscriptionItemRate"
ADD CONSTRAINT "SubscriptionItemRate_no_overlapping_effective_periods"
EXCLUDE USING GIST (
  "subscriptionItemId" WITH =,
  "billingIntervalMonths" WITH =,
  daterange("effectiveFrom", "effectiveUntil", '[)') WITH &&
);

ALTER TABLE "SubscriptionItem"
ADD CONSTRAINT "SubscriptionItem_customerSubscriptionId_fkey"
FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionItem"
ADD CONSTRAINT "SubscriptionItem_predecessorItemId_fkey"
FOREIGN KEY ("predecessorItemId") REFERENCES "SubscriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionItemRate"
ADD CONSTRAINT "SubscriptionItemRate_subscriptionItemId_fkey"
FOREIGN KEY ("subscriptionItemId") REFERENCES "SubscriptionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionItemRate"
ADD CONSTRAINT "SubscriptionItemRate_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionProviderLink"
ADD CONSTRAINT "SubscriptionProviderLink_customerSubscriptionId_fkey"
FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionProviderItem"
ADD CONSTRAINT "SubscriptionProviderItem_subscriptionProviderLinkId_fkey"
FOREIGN KEY ("subscriptionProviderLinkId") REFERENCES "SubscriptionProviderLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceServiceSnapshot"
ADD CONSTRAINT "InvoiceServiceSnapshot_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceServiceSnapshot"
ADD CONSTRAINT "InvoiceServiceSnapshot_invoiceLineItemId_fkey"
FOREIGN KEY ("invoiceLineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceServiceSnapshot"
ADD CONSTRAINT "InvoiceServiceSnapshot_subscriptionItemId_fkey"
FOREIGN KEY ("subscriptionItemId") REFERENCES "SubscriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceServiceSnapshot"
ADD CONSTRAINT "InvoiceServiceSnapshot_subscriptionItemRateId_fkey"
FOREIGN KEY ("subscriptionItemRateId") REFERENCES "SubscriptionItemRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceAssignment"
ADD CONSTRAINT "ServiceAssignment_subscriptionItemId_fkey"
FOREIGN KEY ("subscriptionItemId") REFERENCES "SubscriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingInvoice"
ADD CONSTRAINT "BillingInvoice_customerSubscriptionId_fkey"
FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingInvoice"
ADD CONSTRAINT "BillingInvoice_subscriptionProviderLinkId_fkey"
FOREIGN KEY ("subscriptionProviderLinkId") REFERENCES "SubscriptionProviderLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
