-- 20260504000002_scholar_v15
--
-- Scholar v1 cache + v1.5 annotation / discussion tables.
-- Every statement is guarded so `prisma migrate deploy` is safe to retry
-- (CLAUDE.md A5). Tables created here are additive-only; no existing
-- column changes.

-- ── ScholarPaper (v1 cache) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScholarPaper" (
  "id"                TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "abstract"          TEXT,
  "authorsJson"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "venue"             TEXT,
  "publishedAt"       TIMESTAMP(3),
  "doi"               TEXT,
  "arxivId"           TEXT,
  "semanticScholarId" TEXT,
  "openAlexId"        TEXT,
  "pubmedId"          TEXT,
  "license"           TEXT,
  "openAccess"        BOOLEAN NOT NULL DEFAULT false,
  "pdfCachedKey"      TEXT,
  "pdfExternalUrl"    TEXT,
  "citationCount"     INTEGER NOT NULL DEFAULT 0,
  "topicsJson"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "viewCount"         INTEGER NOT NULL DEFAULT 0,
  "fetchedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "staleAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScholarPaper_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScholarPaper_doi_key" ON "ScholarPaper"("doi");
CREATE INDEX IF NOT EXISTS "ScholarPaper_staleAt_idx" ON "ScholarPaper"("staleAt");
CREATE INDEX IF NOT EXISTS "ScholarPaper_citationCount_idx" ON "ScholarPaper"("citationCount");
CREATE INDEX IF NOT EXISTS "ScholarPaper_publishedAt_idx" ON "ScholarPaper"("publishedAt");

-- ── ScholarPaperSearchCache (v1 fan-out cache) ──────────────────────────
CREATE TABLE IF NOT EXISTS "ScholarPaperSearchCache" (
  "cacheKey"    TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "resultsJson" JSONB NOT NULL,
  "fetchedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScholarPaperSearchCache_pkey" PRIMARY KEY ("cacheKey")
);

CREATE INDEX IF NOT EXISTS "ScholarPaperSearchCache_expiresAt_idx" ON "ScholarPaperSearchCache"("expiresAt");
CREATE INDEX IF NOT EXISTS "ScholarPaperSearchCache_source_idx" ON "ScholarPaperSearchCache"("source");

-- ── ScholarAnnotation (v1.5) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScholarAnnotation" (
  "id"         SERIAL NOT NULL,
  "userId"     INTEGER NOT NULL,
  "paperId"    TEXT NOT NULL,
  "rangeJson"  JSONB NOT NULL,
  "body"       TEXT,
  "color"      TEXT NOT NULL DEFAULT 'yellow',
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScholarAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScholarAnnotation_paperId_visibility_idx"
  ON "ScholarAnnotation"("paperId", "visibility");
CREATE INDEX IF NOT EXISTS "ScholarAnnotation_userId_idx"
  ON "ScholarAnnotation"("userId");

DO $$
BEGIN
  ALTER TABLE "ScholarAnnotation"
    ADD CONSTRAINT "ScholarAnnotation_paperId_fkey"
    FOREIGN KEY ("paperId") REFERENCES "ScholarPaper"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── ScholarDiscussionThread (v1.5) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScholarDiscussionThread" (
  "id"        SERIAL NOT NULL,
  "paperId"   TEXT NOT NULL,
  "schoolId"  INTEGER,
  "authorId"  INTEGER NOT NULL,
  "body"      TEXT NOT NULL,
  "parentId"  INTEGER,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScholarDiscussionThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScholarDiscussionThread_paper_school_created_idx"
  ON "ScholarDiscussionThread"("paperId", "schoolId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScholarDiscussionThread_parentId_idx"
  ON "ScholarDiscussionThread"("parentId");
CREATE INDEX IF NOT EXISTS "ScholarDiscussionThread_authorId_idx"
  ON "ScholarDiscussionThread"("authorId");

DO $$
BEGIN
  ALTER TABLE "ScholarDiscussionThread"
    ADD CONSTRAINT "ScholarDiscussionThread_paperId_fkey"
    FOREIGN KEY ("paperId") REFERENCES "ScholarPaper"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ScholarDiscussionThread"
    ADD CONSTRAINT "ScholarDiscussionThread_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "ScholarDiscussionThread"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── ShelfBook extension (sourceType + paperId) ──────────────────────────
ALTER TABLE "ShelfBook" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'book';
ALTER TABLE "ShelfBook" ADD COLUMN IF NOT EXISTS "paperId" TEXT;
CREATE INDEX IF NOT EXISTS "ShelfBook_paperId_idx" ON "ShelfBook"("paperId");
