-- Wave-11 (2026-05-14) — Note search performance indexes.
--
-- L1-3 wide-audit finding: notes search runs ILIKE against the
-- `Note.content` column (up to 200 KB per row) on every keystroke
-- from `/notes` and from `/api/search`. Without indexes this is a
-- sequential scan that scales linearly with the entire notes table
-- — fine at our current 10K notes, painful at 100K.
--
-- Strategy:
--   1. `pg_trgm` extension (PostgreSQL-native trigram index) powers
--      fast ILIKE / wildcard substring search on the content column.
--   2. GIN index on title + content using `gin_trgm_ops` so the
--      `where: { OR: [{ title: { contains } }, { content: { contains } }] }`
--      pattern Prisma generates can hit the indexes instead of seq-
--      scanning. The same index supports `startsWith` / `endsWith`.
--   3. Composite `(userId, updatedAt DESC)` index for the listNotes
--      hot path — that's the orderBy on the dashboard "recently
--      studied" and the notes page default view.
--
-- All operations are `IF NOT EXISTS`-guarded (CLAUDE.md A5).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Note_title_trgm_idx"
  ON "Note" USING GIN ("title" gin_trgm_ops);

-- Content is a large text column. The CONCURRENTLY option isn't
-- compatible with the migration transaction so we create it inline;
-- the cost is a write lock for the duration of the index build,
-- which is acceptable on the current row count and run during a
-- low-traffic deploy window.
CREATE INDEX IF NOT EXISTS "Note_content_trgm_idx"
  ON "Note" USING GIN ("content" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Note_userId_updatedAt_idx"
  ON "Note" ("userId", "updatedAt" DESC);
