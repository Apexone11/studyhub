-- Add description field to StudySheet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='description') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;
