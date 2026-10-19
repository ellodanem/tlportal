-- Standalone invoices are financial history by default. They only become
-- canonical migration evidence after an explicit owner classification.
CREATE TYPE "InvoiceMigrationClassification" AS ENUM ('unreviewed', 'non_subscription', 'recurring_evidence');

ALTER TABLE "Invoice"
  ADD COLUMN "migrationClassification" "InvoiceMigrationClassification" NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "migrationClassificationUpdatedAt" TIMESTAMP(3);

CREATE TABLE "InvoiceMigrationClassificationAudit" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "classification" "InvoiceMigrationClassification" NOT NULL,
  "reason" TEXT NOT NULL,
  "classifiedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceMigrationClassificationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceMigrationClassificationAudit_invoiceId_createdAt_idx"
  ON "InvoiceMigrationClassificationAudit"("invoiceId", "createdAt");
CREATE INDEX "InvoiceMigrationClassificationAudit_classifiedById_idx"
  ON "InvoiceMigrationClassificationAudit"("classifiedById");

ALTER TABLE "InvoiceMigrationClassificationAudit"
  ADD CONSTRAINT "InvoiceMigrationClassificationAudit_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceMigrationClassificationAudit"
  ADD CONSTRAINT "InvoiceMigrationClassificationAudit_classifiedById_fkey"
  FOREIGN KEY ("classifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
