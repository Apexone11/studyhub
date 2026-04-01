-- CreateTable: NoteStar (composite PK on userId + noteId)
CREATE TABLE IF NOT EXISTS "NoteStar" (
    "userId"    INTEGER  NOT NULL,
    "noteId"    INTEGER  NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteStar_pkey" PRIMARY KEY ("userId", "noteId")
);

CREATE INDEX IF NOT EXISTS "NoteStar_noteId_idx" ON "NoteStar"("noteId");

ALTER TABLE "NoteStar"
    ADD CONSTRAINT "NoteStar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteStar"
    ADD CONSTRAINT "NoteStar_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: NoteVersion
CREATE TABLE IF NOT EXISTS "NoteVersion" (
    "id"        SERIAL       NOT NULL,
    "noteId"    INTEGER      NOT NULL,
    "userId"    INTEGER      NOT NULL,
    "title"     TEXT         NOT NULL,
    "content"   TEXT         NOT NULL,
    "message"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NoteVersion_noteId_createdAt_idx" ON "NoteVersion"("noteId", "createdAt" DESC);

ALTER TABLE "NoteVersion"
    ADD CONSTRAINT "NoteVersion_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteVersion"
    ADD CONSTRAINT "NoteVersion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
