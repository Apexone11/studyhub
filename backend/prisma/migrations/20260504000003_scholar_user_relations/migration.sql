-- Loop-6-CRIT + Loop-2-CRIT: add User FK relations to ScholarAnnotation and
-- ScholarDiscussionThread so the controllers can join through `user`/`author`
-- AND so deleting a user cascades cleanly. Idempotent per CLAUDE.md A5.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScholarAnnotation_userId_fkey'
  ) THEN
    ALTER TABLE "ScholarAnnotation"
      ADD CONSTRAINT "ScholarAnnotation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScholarDiscussionThread_authorId_fkey'
  ) THEN
    ALTER TABLE "ScholarDiscussionThread"
      ADD CONSTRAINT "ScholarDiscussionThread_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
