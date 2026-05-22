-- 2026-05-15 — SheetContribution.forkSheetId + status composite index.
--
-- Wave-12 follow-up to the 2026-05-16 contribute-back fix bundle.
-- The new sheets.serializer.fetchContributionCollections runs a
-- groupBy on `forkSheetId + status` for every sheet read to power the
-- public outgoingContributionsSummary chip. The schema previously had
-- `@@index([targetSheetId, status])` (for the incoming summary) but
-- NO index on `forkSheetId`, so the outgoing-summary groupBy would
-- seq-scan the whole table on each request.
--
-- At today's data volume (~few hundred contribution rows) the seq scan
-- is sub-millisecond, but the schema convention is "if you query it
-- with a filter + a group-by, index the leading column." This stays
-- well ahead of growth.
--
-- All operations `IF NOT EXISTS`-guarded per CLAUDE.md A5.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'SheetContribution_forkSheetId_status_idx'
  ) THEN
    CREATE INDEX "SheetContribution_forkSheetId_status_idx"
      ON "SheetContribution" ("forkSheetId", "status");
  END IF;
END $$;
