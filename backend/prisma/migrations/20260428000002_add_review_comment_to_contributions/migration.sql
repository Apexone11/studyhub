-- Adds the reviewComment column that schema.prisma has had since
-- commit 12469c6a but was never paired with a migration. Production
-- DB drift caused every `prisma.sheetContribution.findMany` to throw
-- "column does not exist", which cascaded into 503s + CORS errors
-- across /api/sheets, /api/study-groups, /api/messages, /api/feed.
--
-- IF NOT EXISTS makes this safe to re-run on any environment that
-- somehow already has the column (local dev that was patched manually,
-- a Railway DB that someone fixed by hand, etc.).

ALTER TABLE "SheetContribution"
  ADD COLUMN IF NOT EXISTS "reviewComment" TEXT NOT NULL DEFAULT '';
