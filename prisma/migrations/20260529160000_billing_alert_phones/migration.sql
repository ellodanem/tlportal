-- Staff SMS numbers when a billing WhatsApp is skipped (no pay link).
ALTER TABLE "AppSettings" ADD COLUMN "billingAlertPhones" TEXT;

CREATE TABLE "BillingPayLinkAdminAlert" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reminderKind" TEXT NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayLinkAdminAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPayLinkAdminAlert_customerId_reminderKind_nextDueDate_key" ON "BillingPayLinkAdminAlert"("customerId", "reminderKind", "nextDueDate");

CREATE INDEX "BillingPayLinkAdminAlert_notifiedAt_idx" ON "BillingPayLinkAdminAlert"("notifiedAt" DESC);

ALTER TABLE "BillingPayLinkAdminAlert" ADD CONSTRAINT "BillingPayLinkAdminAlert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
