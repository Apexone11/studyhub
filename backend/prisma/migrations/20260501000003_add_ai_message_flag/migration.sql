-- Migration: per-message report flow on AiMessage. Lets users flag
-- assistant outputs for admin review (harmful, inaccurate, biased,
-- illegal, other). Industry-standard for any LLM-backed product.
--
-- Idempotent guards (ADD COLUMN IF NOT EXISTS / CREATE INDEX
-- IF NOT EXISTS) match the achievements-v2 migration pattern so a
-- redeploy or partial-apply scenario can replay this file without
-- breaking the chain.

ALTER TABLE "AiMessage"
    ADD COLUMN IF NOT EXISTS "flaggedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "flaggedReason" TEXT,
    ADD COLUMN IF NOT EXISTS "flaggedById" INTEGER,
    ADD COLUMN IF NOT EXISTS "flaggedNote" TEXT;

CREATE INDEX IF NOT EXISTS "AiMessage_flaggedAt_idx" ON "AiMessage"("flaggedAt");
