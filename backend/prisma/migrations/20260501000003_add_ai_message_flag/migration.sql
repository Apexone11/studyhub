-- Migration: per-message report flow on AiMessage. Lets users flag
-- assistant outputs for admin review (harmful, inaccurate, biased,
-- illegal, other). Industry-standard for any LLM-backed product.

ALTER TABLE "AiMessage"
    ADD COLUMN "flaggedAt" TIMESTAMP(3),
    ADD COLUMN "flaggedReason" TEXT,
    ADD COLUMN "flaggedById" INTEGER,
    ADD COLUMN "flaggedNote" TEXT;

CREATE INDEX "AiMessage_flaggedAt_idx" ON "AiMessage"("flaggedAt");
