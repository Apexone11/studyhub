-- Wave-11 (2026-05-14) — Announcement.urgency + Announcement.updatedAt.
--
-- urgency: 'normal' | 'urgent'. Urgent announcements bypass per-user
-- mutes (mute is for noisy admins, not safety-critical broadcasts).
-- Feature-expansion roadmap decision #16 + addendum §6 MEDIUM (G1-4).
--
-- updatedAt: needed for the bell-widget edited-indicator + future
-- "Updated" badge on edited announcements. Easy-win #1 from the
-- 2026-05-14 v2/v2.2 gap audit.
--
-- Idempotent per CLAUDE.md A5 — `IF NOT EXISTS` on both columns so
-- re-running the migration on a database that already has either
-- column is a no-op rather than a hard error.

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "urgency" TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: existing rows get updatedAt = createdAt so the
-- "edited" indicator only triggers on rows actually edited after this
-- migration. Without the backfill all pre-existing rows would appear
-- edited (updatedAt = NOW() default vs original createdAt).
UPDATE "Announcement"
  SET "updatedAt" = "createdAt"
  WHERE "updatedAt" > "createdAt" + INTERVAL '1 second';
