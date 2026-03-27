CREATE TABLE "EmailDeliveryEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerWebhookId" TEXT,
    "providerMessageId" TEXT,
    "recipient" TEXT,
    "subject" TEXT,
    "eventCreatedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailDeliveryEvent_providerWebhookId_key" ON "EmailDeliveryEvent"("providerWebhookId");
CREATE INDEX "EmailDeliveryEvent_provider_eventType_receivedAt_idx" ON "EmailDeliveryEvent"("provider", "eventType", "receivedAt" DESC);
CREATE INDEX "EmailDeliveryEvent_providerMessageId_receivedAt_idx" ON "EmailDeliveryEvent"("providerMessageId", "receivedAt" DESC);
CREATE INDEX "EmailDeliveryEvent_recipient_receivedAt_idx" ON "EmailDeliveryEvent"("recipient", "receivedAt" DESC);
