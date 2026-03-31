-- CreateTable
CREATE TABLE "DiscussionUpvote" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER,
    "replyId" INTEGER,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscussionUpvote_postId_idx" ON "DiscussionUpvote"("postId");

-- CreateIndex
CREATE INDEX "DiscussionUpvote_replyId_idx" ON "DiscussionUpvote"("replyId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionUpvote_postId_userId_key" ON "DiscussionUpvote"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionUpvote_replyId_userId_key" ON "DiscussionUpvote"("replyId", "userId");

-- AddForeignKey
ALTER TABLE "DiscussionUpvote" ADD CONSTRAINT "DiscussionUpvote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupDiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionUpvote" ADD CONSTRAINT "DiscussionUpvote_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "GroupDiscussionReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionUpvote" ADD CONSTRAINT "DiscussionUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
