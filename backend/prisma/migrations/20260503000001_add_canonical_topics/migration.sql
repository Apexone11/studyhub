-- Add canonical-topic columns to Hashtag for the topic-picker feature.
-- Idempotent: re-running on a deployed database is safe.

ALTER TABLE "Hashtag"
  ADD COLUMN IF NOT EXISTS "isCanonical" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT;

CREATE INDEX IF NOT EXISTS "Hashtag_isCanonical_category_idx"
  ON "Hashtag" ("isCanonical", "category");
