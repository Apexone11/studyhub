-- Add HTML scan metadata to StudySheet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanStatus') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanStatus" TEXT NOT NULL DEFAULT 'queued';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanFindings') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanFindings" JSONB;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanUpdatedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanUpdatedAt" TIMESTAMP(3);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlScanAcknowledgedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlScanAcknowledgedAt" TIMESTAMP(3);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StudySheet' AND column_name='htmlOriginalArchivedAt') THEN
    ALTER TABLE "StudySheet" ADD COLUMN "htmlOriginalArchivedAt" TIMESTAMP(3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StudySheet_htmlScanStatus_updatedAt_idx"
  ON "StudySheet"("htmlScanStatus", "updatedAt" DESC);

-- Track original + working HTML versions per sheet draft/review workflow
CREATE TABLE IF NOT EXISTS "SheetHtmlVersion" (
  "id" SERIAL NOT NULL,
  "sheetId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceName" TEXT,
  "content" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "compressionAlgo" TEXT,
  "compressedContent" BYTEA,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SheetHtmlVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SheetHtmlVersion_sheetId_kind_key"
  ON "SheetHtmlVersion"("sheetId", "kind");

CREATE INDEX IF NOT EXISTS "SheetHtmlVersion_kind_updatedAt_idx"
  ON "SheetHtmlVersion"("kind", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "SheetHtmlVersion_archivedAt_updatedAt_idx"
  ON "SheetHtmlVersion"("archivedAt", "updatedAt" DESC);

ALTER TABLE "SheetHtmlVersion"
  DROP CONSTRAINT IF EXISTS "SheetHtmlVersion_sheetId_fkey";
ALTER TABLE "SheetHtmlVersion"
  ADD CONSTRAINT "SheetHtmlVersion_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SheetHtmlVersion"
  DROP CONSTRAINT IF EXISTS "SheetHtmlVersion_userId_fkey";
ALTER TABLE "SheetHtmlVersion"
  ADD CONSTRAINT "SheetHtmlVersion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
