-- Note additions (contentHash already exists from an earlier migration)
ALTER TABLE "Note" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Note" ADD COLUMN "lastSaveId" UUID;

-- NoteVersionKind enum
CREATE TYPE "NoteVersionKind" AS ENUM ('AUTO', 'MANUAL', 'PRE_RESTORE', 'CONFLICT_LOSER');

-- NoteVersion additions. parentVersionId is INTEGER because NoteVersion.id is INT.
ALTER TABLE "NoteVersion" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NoteVersion" ADD COLUMN "parentVersionId" INTEGER;
ALTER TABLE "NoteVersion" ADD COLUMN "kind" "NoteVersionKind" NOT NULL DEFAULT 'AUTO';
ALTER TABLE "NoteVersion" ADD COLUMN "bytesContent" INTEGER NOT NULL DEFAULT 0;

-- Additive ASC index. The existing DESC index (NoteVersion_noteId_createdAt_idx) is kept;
-- this one supports ascending-order scans for version replay.
CREATE INDEX "NoteVersion_noteId_createdAt_hard_idx" ON "NoteVersion"("noteId", "createdAt");
