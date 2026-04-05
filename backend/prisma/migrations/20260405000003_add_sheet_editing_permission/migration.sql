-- Add allowEditing to StudySheet for owner-controlled edit access
ALTER TABLE "StudySheet" ADD COLUMN "allowEditing" BOOLEAN NOT NULL DEFAULT false;
