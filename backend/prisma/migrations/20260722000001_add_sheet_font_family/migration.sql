-- Per-sheet typeface (plan: docs/internal/plans/sheet-customization-125.md, option 2).
-- Idempotent per CLAUDE.md A5: safe to re-run on retry.

ALTER TABLE "StudySheet"
    ADD COLUMN IF NOT EXISTS "fontFamily" TEXT NOT NULL DEFAULT 'sans';
