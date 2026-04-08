-- Comment reactions for sheet comments
CREATE TABLE "CommentReaction" (
    "userId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("userId","commentId"),
    CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommentReaction_commentId_type_idx" ON "CommentReaction"("commentId", "type");

-- Comment reactions for feed post comments
CREATE TABLE "FeedPostCommentReaction" (
    "userId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "FeedPostCommentReaction_pkey" PRIMARY KEY ("userId","commentId"),
    CONSTRAINT "FeedPostCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPostCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FeedPostCommentReaction_commentId_type_idx" ON "FeedPostCommentReaction"("commentId", "type");

-- Comment reactions for note comments
CREATE TABLE "NoteCommentReaction" (
    "userId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "NoteCommentReaction_pkey" PRIMARY KEY ("userId","commentId"),
    CONSTRAINT "NoteCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "NoteComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NoteCommentReaction_commentId_type_idx" ON "NoteCommentReaction"("commentId", "type");
