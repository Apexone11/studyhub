-- 2026-05-16 — Cross-surface link fields (wave-12.3, ecosystem Track 2).
--
-- Adds explicit cross-references that let one entity link to another
-- across sub-ecosystems. Powers backlinks footers + the "Related work"
-- strip on detail pages. All columns nullable + IF NOT EXISTS-guarded
-- per CLAUDE.md A5.
--
-- Columns added:
--   StudySheet.libraryVolumeId         — Google Books volumeId this
--                                        sheet was written about (the
--                                        textbook the sheet covers).
--   StudySheet.derivedFromPaperId      — Scholar paper this sheet was
--                                        generated FROM via the
--                                        "Generate sheet from paper"
--                                        flow. Provides the link back.
--   Note.relatedSheetId                — Sheet a note was written about.
--   Note.relatedPaperId                — Scholar paper a note references.
--
-- Indexes on each FK column for the "find all sheets about X" reverse
-- lookup the backlinks footer needs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StudySheet'
      AND column_name = 'libraryVolumeId'
  ) THEN
    ALTER TABLE "StudySheet" ADD COLUMN "libraryVolumeId" VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StudySheet'
      AND column_name = 'derivedFromPaperId'
  ) THEN
    ALTER TABLE "StudySheet" ADD COLUMN "derivedFromPaperId" VARCHAR(128);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Note'
      AND column_name = 'relatedSheetId'
  ) THEN
    ALTER TABLE "Note" ADD COLUMN "relatedSheetId" INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Note'
      AND column_name = 'relatedPaperId'
  ) THEN
    ALTER TABLE "Note" ADD COLUMN "relatedPaperId" VARCHAR(128);
  END IF;
END $$;

-- Indexes for the reverse lookup ("find all sheets about library volume X").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'StudySheet_libraryVolumeId_idx'
  ) THEN
    CREATE INDEX "StudySheet_libraryVolumeId_idx" ON "StudySheet" ("libraryVolumeId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'StudySheet_derivedFromPaperId_idx'
  ) THEN
    CREATE INDEX "StudySheet_derivedFromPaperId_idx" ON "StudySheet" ("derivedFromPaperId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'Note_relatedSheetId_idx'
  ) THEN
    CREATE INDEX "Note_relatedSheetId_idx" ON "Note" ("relatedSheetId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'Note_relatedPaperId_idx'
  ) THEN
    CREATE INDEX "Note_relatedPaperId_idx" ON "Note" ("relatedPaperId");
  END IF;
END $$;
