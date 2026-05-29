-- Idempotency log for billing WhatsApp reminders (Twilio Content templates).
CREATE TABLE "BillingWhatsAppReminder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reminderKind" TEXT NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "twilioMessageSid" TEXT,
    "payLinkSource" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingWhatsAppReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingWhatsAppReminder_customerId_reminderKind_nextDueDate_key" ON "BillingWhatsAppReminder"("customerId", "reminderKind", "nextDueDate");

CREATE INDEX "BillingWhatsAppReminder_customerId_sentAt_idx" ON "BillingWhatsAppReminder"("customerId", "sentAt" DESC);

ALTER TABLE "BillingWhatsAppReminder" ADD CONSTRAINT "BillingWhatsAppReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
