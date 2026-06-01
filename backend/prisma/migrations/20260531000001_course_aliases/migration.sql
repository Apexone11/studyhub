-- 20260531000001_course_aliases
--
-- G2-4 — Course aliasing. Adds CourseAlias + TopicCanonical so cross-school
-- search can expand a topic ("intro programming") to every school's
-- equivalent course, and a course-detail "Equivalent at other schools" view
-- can be rendered. pg_trgm powers the fuzzy displayName match (similarity > 0.3).
--
-- Every statement is guarded so `prisma migrate deploy` is safe to retry on
-- partial failure (CLAUDE.md A5). Additive-only — no-op on an already-migrated DB.

-- Trigram fuzzy-match support. Managed Postgres (Railway) ships pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── CourseAlias ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CourseAlias" (
  "id"        SERIAL NOT NULL,
  "topicTag"  VARCHAR(80) NOT NULL,
  "courseId"  INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CourseAlias_pkey" PRIMARY KEY ("id")
);

-- ── TopicCanonical ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TopicCanonical" (
  "topicTag"    VARCHAR(80) NOT NULL,
  "displayName" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "category"    VARCHAR(40),
  "cipCode"     VARCHAR(7),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TopicCanonical_pkey" PRIMARY KEY ("topicTag")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourseAlias_topicTag_courseId_key"
  ON "CourseAlias"("topicTag", "courseId");
CREATE INDEX IF NOT EXISTS "CourseAlias_topicTag_idx" ON "CourseAlias"("topicTag");
CREATE INDEX IF NOT EXISTS "CourseAlias_courseId_idx" ON "CourseAlias"("courseId");

-- GIN trigram index so similarity(displayName, q) > 0.3 is index-backed.
CREATE INDEX IF NOT EXISTS "TopicCanonical_displayName_trgm_idx"
  ON "TopicCanonical" USING gin ("displayName" gin_trgm_ops);

DO $$
BEGIN
  ALTER TABLE "CourseAlias"
    ADD CONSTRAINT "CourseAlias_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
