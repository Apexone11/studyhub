-- 20260512000001_note_highlights
--
-- Phase 9 — Note Review v1. Adds the `NoteHighlight` table that
-- backs the range-anchored highlight feature on /notes/:id.
--
-- Every statement is guarded so `prisma migrate deploy` is safe to
-- retry on partial failure (CLAUDE.md A5). Additive-only.

-- ── NoteHighlight ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NoteHighlight" (
  "id"            SERIAL NOT NULL,
  "noteId"        INTEGER NOT NULL,
  "userId"        INTEGER NOT NULL,
  "anchorText"    TEXT NOT NULL,
  "anchorOffset"  INTEGER NOT NULL,
  "anchorContext" TEXT,
  "color"         TEXT NOT NULL DEFAULT 'yellow',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NoteHighlight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NoteHighlight_noteId_createdAt_idx"
  ON "NoteHighlight"("noteId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "NoteHighlight_userId_idx"
  ON "NoteHighlight"("userId");

DO $$
BEGIN
  ALTER TABLE "NoteHighlight"
    ADD CONSTRAINT "NoteHighlight_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "NoteHighlight"
    ADD CONSTRAINT "NoteHighlight_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
