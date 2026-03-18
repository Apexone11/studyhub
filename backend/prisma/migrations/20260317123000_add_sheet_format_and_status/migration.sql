ALTER TABLE "StudySheet"
ADD COLUMN IF NOT EXISTS "contentFormat" TEXT NOT NULL DEFAULT 'markdown',
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'published';

UPDATE "StudySheet"
SET "status" = 'published'
WHERE "status" IS NULL OR "status" = '';

CREATE INDEX IF NOT EXISTS "StudySheet_status_createdAt_idx"
ON "StudySheet"("status", "createdAt" DESC);