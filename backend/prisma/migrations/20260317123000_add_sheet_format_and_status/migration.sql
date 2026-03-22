DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='contentFormat') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "contentFormat" TEXT NOT NULL DEFAULT 'markdown';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='status') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';
  END IF;
END $$;

UPDATE "StudySheet"
SET "status" = 'published'
WHERE "status" IS NULL OR "status" = '';

CREATE INDEX IF NOT EXISTS "StudySheet_status_createdAt_idx"
ON "StudySheet"("status", "createdAt" DESC);
