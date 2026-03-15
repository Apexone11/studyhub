-- Add description field to StudySheet
ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
