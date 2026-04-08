-- Add downloads counter to Note
ALTER TABLE "Note" ADD COLUMN "downloads" INTEGER NOT NULL DEFAULT 0;

-- Create NoteReaction table (like/dislike for notes)
CREATE TABLE "NoteReaction" (
    "userId" INTEGER NOT NULL,
    "noteId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "NoteReaction_pkey" PRIMARY KEY ("userId","noteId")
);

-- CreateIndex
CREATE INDEX "NoteReaction_noteId_type_idx" ON "NoteReaction"("noteId", "type");

-- AddForeignKey
ALTER TABLE "NoteReaction" ADD CONSTRAINT "NoteReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteReaction" ADD CONSTRAINT "NoteReaction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
