-- Migration: add UserStreak — denormalized retention counter.
--
-- Why a dedicated row instead of computing on demand from
-- UserDailyActivity? The streak number is read on every profile
-- page load and dashboard render; scanning 366 days of activity
-- per request is wasteful, and a separate row lets the daily
-- sweeper reset stale rows in a single UPDATE without touching
-- the activity log.
--
-- Idempotent per CLAUDE.md A5: every CREATE uses IF NOT EXISTS
-- and the foreign-key add is wrapped in DO $$ EXCEPTION so a
-- replay or partial-apply can't break the migration chain.

CREATE TABLE IF NOT EXISTS "UserStreak" (
    "userId" INTEGER PRIMARY KEY,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserStreak_userId_fkey'
    ) THEN
        ALTER TABLE "UserStreak"
            ADD CONSTRAINT "UserStreak_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS "UserStreak_lastActiveDate_idx" ON "UserStreak"("lastActiveDate");
