-- Normal canonical subscription operations. Additive only: existing legacy,
-- shadow, invoice, payment, and manual-pilot records remain untouched.

CREATE TYPE "CanonicalInitialBillingMode" AS ENUM ('advance_invoice', 'deferred');

CREATE TABLE "CanonicalSubscriptionOperationalActivation" (
    "id" TEXT NOT NULL,
    "customerSubscriptionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "activationKey" TEXT NOT NULL,
    "initialBillingMode" "CanonicalInitialBillingMode" NOT NULL,
    "initialPeriodStart" DATE,
    "initialPeriodEnd" DATE,
    "initialInvoiceId" TEXT,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "confirmationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalSubscriptionOperationalActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalSubscriptionOperationalActivation_customerSubscriptionId_key"
  ON "CanonicalSubscriptionOperationalActivation"("customerSubscriptionId");
CREATE UNIQUE INDEX "CanonicalSubscriptionOperationalActivation_activationKey_key"
  ON "CanonicalSubscriptionOperationalActivation"("activationKey");
CREATE UNIQUE INDEX "CanonicalSubscriptionOperationalActivation_initialInvoiceId_key"
  ON "CanonicalSubscriptionOperationalActivation"("initialInvoiceId");
CREATE INDEX "CanonicalSubscriptionOperationalActivation_customerId_performedAt_idx"
  ON "CanonicalSubscriptionOperationalActivation"("customerId", "performedAt");

ALTER TABLE "Invoice" ADD COLUMN "canonicalInitialGenerationKey" TEXT;
CREATE UNIQUE INDEX "Invoice_canonicalInitialGenerationKey_key"
  ON "Invoice"("canonicalInitialGenerationKey");

ALTER TABLE "CanonicalSubscriptionOperationalActivation"
  ADD CONSTRAINT "CanonicalSubscriptionOperationalActivation_customerSubscriptionId_fkey"
  FOREIGN KEY ("customerSubscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalSubscriptionOperationalActivation"
  ADD CONSTRAINT "CanonicalSubscriptionOperationalActivation_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalSubscriptionOperationalActivation"
  ADD CONSTRAINT "CanonicalSubscriptionOperationalActivation_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalSubscriptionOperationalActivation"
  ADD CONSTRAINT "CanonicalSubscriptionOperationalActivation_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalSubscriptionOperationalActivation"
  ADD CONSTRAINT "CanonicalSubscriptionOperationalActivation_initialInvoiceId_fkey"
  FOREIGN KEY ("initialInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
