-- Phase 2 of v2 design refresh — Day 3 schema catch-up.
-- UpcomingExamsCard Figma includes a preparedness progress bar
-- ("62% prepared"). CourseExam didn't have a column for it until now.
-- Default 0 matches "new exam, no studying yet"; CHECK constraint
-- pins the value inside the visual bar range so the frontend never
-- has to clamp.

ALTER TABLE "CourseExam"
  ADD COLUMN "preparednessPercent" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CourseExam"
  ADD CONSTRAINT "CourseExam_preparednessPercent_range"
  CHECK ("preparednessPercent" >= 0 AND "preparednessPercent" <= 100);
