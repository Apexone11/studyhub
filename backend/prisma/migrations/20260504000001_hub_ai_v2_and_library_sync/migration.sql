-- Migration: Hub AI v2 (document upload) + library weekly corpus sync.
--
-- Adds five new tables and extends two existing tables. Every statement
-- is wrapped in `IF NOT EXISTS` or a `DO $$ ... EXCEPTION WHEN
-- duplicate_object` block so a redeploy or partial-apply replays
-- cleanly (CLAUDE.md A5).
--
-- Background: see docs/internal/audits/2026-05-04-master-plan-hub-ai-library-bugs.md
--   §6 (schema), §24.7 (consolidated CRIT/HIGH additions: storage cap race,
--   spend ceiling, idempotency).

-- ── AiAttachment ──────────────────────────────────────────────────────
-- Stores metadata for files uploaded into Hub AI conversations. The
-- payload itself lives in the private R2 bucket keyed by `r2Key`. A
-- two-phase sweeper (mark deletedAt, then drain to R2) hard-deletes
-- expired rows; see backend/src/lib/jobs/aiAttachmentSweeper.js.

CREATE TABLE IF NOT EXISTS "AiAttachment" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "messageId" INTEGER,
    "r2Key" TEXT NOT NULL,
    "r2Etag" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileNameHash" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "pinnedUntil" TIMESTAMP(3),
    "extractedText" TEXT,
    "extractedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiAttachment_r2Key_key" ON "AiAttachment"("r2Key");
CREATE INDEX IF NOT EXISTS "AiAttachment_userId_expiresAt_idx" ON "AiAttachment"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "AiAttachment_conversationId_idx" ON "AiAttachment"("conversationId");
CREATE INDEX IF NOT EXISTS "AiAttachment_deletedAt_expiresAt_idx" ON "AiAttachment"("deletedAt", "expiresAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AiAttachment_userId_fkey'
    ) THEN
        ALTER TABLE "AiAttachment"
            ADD CONSTRAINT "AiAttachment_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AiAttachment_conversationId_fkey'
    ) THEN
        ALTER TABLE "AiAttachment"
            ADD CONSTRAINT "AiAttachment_conversationId_fkey"
            FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ── UserAiStorageQuota ────────────────────────────────────────────────
-- Per-user rolling storage cap for AI uploads. The cap column is set
-- per-plan at first-insert time; the ai service does an atomic
-- UPDATE WHERE totalBytes + $bytes <= cap to defeat race conditions
-- (master plan L3-HIGH-3).

CREATE TABLE IF NOT EXISTS "UserAiStorageQuota" (
    "userId" INTEGER PRIMARY KEY,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "cap" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserAiStorageQuota_userId_fkey'
    ) THEN
        ALTER TABLE "UserAiStorageQuota"
            ADD CONSTRAINT "UserAiStorageQuota_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── AiGlobalSpendDay ──────────────────────────────────────────────────
-- One row per UTC date. Pre-flight check on every Anthropic call does
-- an atomic UPDATE WHERE costUsdCents + estCost <= ceilingCents so a
-- traffic burst can't blow the daily budget (master plan L5-CRIT-1).
-- Admin tier bypasses this check entirely (founder-locked 2026-05-04).

CREATE TABLE IF NOT EXISTS "AiGlobalSpendDay" (
    "date" DATE PRIMARY KEY,
    "tokensIn" BIGINT NOT NULL DEFAULT 0,
    "tokensOut" BIGINT NOT NULL DEFAULT 0,
    "documentTokens" BIGINT NOT NULL DEFAULT 0,
    "costUsdCents" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0
);

-- ── AiUploadIdempotency ───────────────────────────────────────────────
-- Stripe-style idempotency. Client passes Idempotency-Key header on
-- POST /api/ai/attachments; if a row exists with the same key for the
-- same userId, return the previously-created attachment instead of
-- re-uploading. 24h TTL.

CREATE TABLE IF NOT EXISTS "AiUploadIdempotency" (
    "key" TEXT PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "attachmentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "AiUploadIdempotency_expiresAt_idx" ON "AiUploadIdempotency"("expiresAt");

-- ── LibrarySyncState ──────────────────────────────────────────────────
-- Drives the weekly Google Books corpus sync. Each row tracks one
-- canonical query string. The job picks the 5 oldest queries, fetches
-- the next page from `lastStartIndex`, and advances. `capDiscovered`
-- = true when the upstream returned <DEFAULT_PAGE_SIZE rows; the
-- query then waits for `resetAt` before being re-eligible.

CREATE TABLE IF NOT EXISTS "LibrarySyncState" (
    "id" SERIAL PRIMARY KEY,
    "queryKey" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStartIndex" INTEGER NOT NULL DEFAULT 0,
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "capDiscovered" BOOLEAN NOT NULL DEFAULT false,
    "resetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LibrarySyncState_queryKey_key" ON "LibrarySyncState"("queryKey");
CREATE INDEX IF NOT EXISTS "LibrarySyncState_lastRunAt_idx" ON "LibrarySyncState"("lastRunAt");

-- ── AiMessage column add ──────────────────────────────────────────────
-- attachments JSON snapshot so re-rendering a conversation after page
-- reload doesn't need a separate join.

ALTER TABLE "AiMessage"
    ADD COLUMN IF NOT EXISTS "attachments" JSONB;

-- ── AiUsageLog column adds ────────────────────────────────────────────
-- Per-user daily usage now tracks document uploads + token splits +
-- cost so the admin dashboard can render per-tier cost reporting and
-- the per-user daily token sub-cap is enforceable.

ALTER TABLE "AiUsageLog"
    ADD COLUMN IF NOT EXISTS "documentCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tokensIn" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tokensOut" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "documentTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "costUsdCents" INTEGER NOT NULL DEFAULT 0;
