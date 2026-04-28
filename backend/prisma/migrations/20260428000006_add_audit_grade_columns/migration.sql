ALTER TABLE "StudySheet"
  ADD COLUMN IF NOT EXISTS "lastAuditGrade" VARCHAR(1),
  ADD COLUMN IF NOT EXISTS "lastAuditReport" JSONB,
  ADD COLUMN IF NOT EXISTS "lastAuditedAt" TIMESTAMP(3);

ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS "lastAuditGrade" VARCHAR(1),
  ADD COLUMN IF NOT EXISTS "lastAuditReport" JSONB,
  ADD COLUMN IF NOT EXISTS "lastAuditedAt" TIMESTAMP(3);

ALTER TABLE "Material"
  ADD COLUMN IF NOT EXISTS "lastAuditGrade" VARCHAR(1),
  ADD COLUMN IF NOT EXISTS "lastAuditReport" JSONB,
  ADD COLUMN IF NOT EXISTS "lastAuditedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "StudySheet_lastAuditGrade_updatedAt_idx"
  ON "StudySheet" ("lastAuditGrade", "updatedAt")
  WHERE "lastAuditGrade" IN ('D', 'F');