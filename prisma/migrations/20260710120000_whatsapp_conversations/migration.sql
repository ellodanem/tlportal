-- WhatsApp conversation threads (inbound webhook + staff replies).
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "customerId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConversation_phoneE164_key" ON "WhatsAppConversation"("phoneE164");
CREATE INDEX "WhatsAppConversation_customerId_lastMessageAt_idx" ON "WhatsAppConversation"("customerId", "lastMessageAt" DESC);
CREATE INDEX "WhatsAppConversation_lastMessageAt_idx" ON "WhatsAppConversation"("lastMessageAt" DESC);

ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT,
    "twilioMessageSid" TEXT,
    "status" TEXT,
    "actorUserId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'inbound',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessage_twilioMessageSid_key" ON "WhatsAppMessage"("twilioMessageSid");
CREATE INDEX "WhatsAppMessage_conversationId_occurredAt_idx" ON "WhatsAppMessage"("conversationId", "occurredAt");

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
