-- Phase 2 of v2 design refresh — Upcoming Exams card.
-- Adds a private-per-user "CourseExam" model tied to a Course + User.
-- See docs/internal/design-refresh-v2-master-plan.md §5.

CREATE TABLE IF NOT EXISTS "CourseExam" (
  "id"         SERIAL PRIMARY KEY,
  "userId"     INTEGER NOT NULL,
  "courseId"   INTEGER NOT NULL,
  "title"      VARCHAR(120) NOT NULL,
  "location"   VARCHAR(120),
  "examDate"   TIMESTAMP(3) NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "notes"      VARCHAR(500),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CourseExam_userId_examDate_idx"
  ON "CourseExam" ("userId", "examDate");

CREATE INDEX IF NOT EXISTS "CourseExam_courseId_examDate_idx"
  ON "CourseExam" ("courseId", "examDate");

-- Foreign keys: cascade delete when the owning user or course is removed.
-- Wrapped in a DO block so the migration is rerunnable if partially applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CourseExam_userId_fkey'
  ) THEN
    ALTER TABLE "CourseExam"
      ADD CONSTRAINT "CourseExam_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CourseExam_courseId_fkey'
  ) THEN
    ALTER TABLE "CourseExam"
      ADD CONSTRAINT "CourseExam_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
