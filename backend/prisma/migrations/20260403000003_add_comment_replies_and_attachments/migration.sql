-- Add parentId to Comment (sheet comments)
ALTER TABLE "Comment" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- Add parentId to FeedPostComment
ALTER TABLE "FeedPostComment" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "FeedPostComment" ADD CONSTRAINT "FeedPostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FeedPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "FeedPostComment_parentId_idx" ON "FeedPostComment"("parentId");

-- Add parentId to NoteComment
ALTER TABLE "NoteComment" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "NoteComment" ADD CONSTRAINT "NoteComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NoteComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "NoteComment_parentId_idx" ON "NoteComment"("parentId");

-- Comment attachments for sheet comments
CREATE TABLE "CommentAttachment" (
    "id" SERIAL PRIMARY KEY,
    "commentId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommentAttachment_commentId_idx" ON "CommentAttachment"("commentId");

-- Comment attachments for feed post comments
CREATE TABLE "FeedPostCommentAttachment" (
    "id" SERIAL PRIMARY KEY,
    "commentId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedPostCommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FeedPostCommentAttachment_commentId_idx" ON "FeedPostCommentAttachment"("commentId");

-- Comment attachments for note comments
CREATE TABLE "NoteCommentAttachment" (
    "id" SERIAL PRIMARY KEY,
    "commentId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteCommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "NoteComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NoteCommentAttachment_commentId_idx" ON "NoteCommentAttachment"("commentId");
