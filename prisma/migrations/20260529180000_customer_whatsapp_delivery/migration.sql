-- Idempotency for one-off customer WhatsApp (payment link, new invoice).
CREATE TABLE "CustomerWhatsAppDelivery" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "twilioMessageSid" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerWhatsAppDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerWhatsAppDelivery_kind_externalRef_key" ON "CustomerWhatsAppDelivery"("kind", "externalRef");

CREATE INDEX "CustomerWhatsAppDelivery_customerId_sentAt_idx" ON "CustomerWhatsAppDelivery"("customerId", "sentAt" DESC);

ALTER TABLE "CustomerWhatsAppDelivery" ADD CONSTRAINT "CustomerWhatsAppDelivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
