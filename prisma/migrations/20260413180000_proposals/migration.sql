-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'sent');

-- CreateEnum
CREATE TYPE "ProposalLineCategory" AS ENUM ('hardware', 'subscription', 'installation', 'service', 'other');

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "clientLabel" TEXT,
    "clientCompany" TEXT,
    "clientContactName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "executiveSummary" TEXT,
    "includedFeatures" TEXT,
    "assumptionsText" TEXT,
    "nextStepsText" TEXT,
    "termsText" TEXT,
    "pricingFootnote" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'XCD',
    "validityDays" INTEGER NOT NULL DEFAULT 14,
    "salesContactName" TEXT,
    "salesContactTitle" TEXT,
    "salesContactEmail" TEXT,
    "salesContactPhone" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalLineItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" "ProposalLineCategory" NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitLabel" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ProposalLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalVisualBlock" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "imageUrl" TEXT,
    "placeholderHint" TEXT,

    CONSTRAINT "ProposalVisualBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proposal_customerId_idx" ON "Proposal"("customerId");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "Proposal_updatedAt_idx" ON "Proposal"("updatedAt");

-- CreateIndex
CREATE INDEX "ProposalLineItem_proposalId_idx" ON "ProposalLineItem"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalVisualBlock_proposalId_idx" ON "ProposalVisualBlock"("proposalId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalLineItem" ADD CONSTRAINT "ProposalLineItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVisualBlock" ADD CONSTRAINT "ProposalVisualBlock_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
