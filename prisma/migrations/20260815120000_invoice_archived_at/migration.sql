-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invoice_archivedAt_idx" ON "Invoice"("archivedAt");
