-- Achievements V2 — additive migration (2026-04-30)
--
-- Plan:      docs/internal/audits/2026-04-30-achievements-v2-plan.md
-- Schema:    backend/prisma/schema.prisma — Badge, UserBadge, AchievementEvent, UserAchievementStats
--
-- Idempotent guards (`IF NOT EXISTS`) so this is safe to redeploy. No DROP,
-- no NOT NULL on existing columns, no destructive backfill in this file.
-- Defaults are set on every new column so existing rows pick up sensible
-- values without a separate UPDATE step.

-- 1. Extend Badge --------------------------------------------------------
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "iconSlug" TEXT;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "xp" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "isSecret" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "criteria" JSONB;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Badge_category_displayOrder_idx" ON "Badge"("category", "displayOrder");
CREATE INDEX IF NOT EXISTS "Badge_isSecret_idx" ON "Badge"("isSecret");

-- 2. Extend UserBadge ----------------------------------------------------
ALTER TABLE "UserBadge" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserBadge" ADD COLUMN IF NOT EXISTS "pinOrder" INTEGER;
ALTER TABLE "UserBadge" ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "UserBadge_userId_pinned_pinOrder_idx" ON "UserBadge"("userId", "pinned", "pinOrder");

-- 3. New table: AchievementEvent -----------------------------------------
CREATE TABLE IF NOT EXISTS "AchievementEvent" (
  "id"         SERIAL PRIMARY KEY,
  "userId"     INTEGER NOT NULL,
  "kind"       TEXT NOT NULL,
  "metadata"   JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AchievementEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AchievementEvent_userId_kind_occurredAt_idx"
  ON "AchievementEvent"("userId", "kind", "occurredAt");
CREATE INDEX IF NOT EXISTS "AchievementEvent_occurredAt_idx"
  ON "AchievementEvent"("occurredAt");

-- 4. New table: UserAchievementStats -------------------------------------
CREATE TABLE IF NOT EXISTS "UserAchievementStats" (
  "userId"             INTEGER PRIMARY KEY,
  "totalXp"            INTEGER NOT NULL DEFAULT 0,
  "level"              INTEGER NOT NULL DEFAULT 1,
  "unlockedCount"      INTEGER NOT NULL DEFAULT 0,
  "highestTier"        TEXT NOT NULL DEFAULT 'bronze',
  "achievementsHidden" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAchievementStats_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
