-- Migration: AI prompt-cache telemetry on AiGlobalSpendDay.
--
-- Adds two BigInt counters so we can compute the daily cache-hit
-- fraction from a single row instead of scanning AiUsageLog. Both
-- columns use `ADD COLUMN IF NOT EXISTS` so a redeploy or partial-
-- apply replays cleanly (CLAUDE.md A5).
--
-- Background: Loop A7 (docs/internal/audits/2026-05-12-loop-A7-ai-cache-telemetry.md)
-- closes Research Loop 1 gap #2 — cache telemetry was half-built
-- (recordActualUsage already received the args, but they were only
-- structured-logged, never persisted to the spend-day row).

ALTER TABLE "AiGlobalSpendDay"
    ADD COLUMN IF NOT EXISTS "cacheReadInputTokens" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cacheCreationInputTokens" BIGINT NOT NULL DEFAULT 0;
