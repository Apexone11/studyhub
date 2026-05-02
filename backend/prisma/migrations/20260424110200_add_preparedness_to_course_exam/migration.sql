-- Phase 2 of v2 design refresh — Day 3 schema catch-up.
-- UpcomingExamsCard Figma includes a preparedness progress bar
-- ("62% prepared"). CourseExam didn't have a column for it until now.
-- Default 0 matches "new exam, no studying yet"; CHECK constraint
-- pins the value inside the visual bar range so the frontend never
-- has to clamp.
--
-- Idempotent guards (CLAUDE.md A5): a bare ALTER TABLE re-run from
-- `prisma migrate deploy` after a transient Railway error blocks every
-- subsequent deployment with "column already exists." Both the column
-- add and the constraint add are guarded so retries are safe no-ops.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CourseExam' AND column_name = 'preparednessPercent'
  ) THEN
    ALTER TABLE "CourseExam"
      ADD COLUMN "preparednessPercent" INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CourseExam_preparednessPercent_range'
  ) THEN
    ALTER TABLE "CourseExam"
      ADD CONSTRAINT "CourseExam_preparednessPercent_range"
      CHECK ("preparednessPercent" >= 0 AND "preparednessPercent" <= 100);
  END IF;
END $$;
