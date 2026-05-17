-- 2026-05-16 — UserPreferences.scopeBySchool for the school-scoped
-- course picker + feed algorithm v2 (wave-12.2 school-scoped-search).
--
-- Default true matches the founder intent that most users see their
-- own school first; existing rows get the new default automatically.
-- Additive + IF NOT EXISTS-guarded per CLAUDE.md A5.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'UserPreferences'
      AND column_name = 'scopeBySchool'
  ) THEN
    ALTER TABLE "UserPreferences"
      ADD COLUMN "scopeBySchool" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
