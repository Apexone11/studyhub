CREATE TABLE "VerificationChallenge" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "payload" JSONB,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationChallenge_token_key" ON "VerificationChallenge"("token");
CREATE INDEX "VerificationChallenge_purpose_userId_expiresAt_idx" ON "VerificationChallenge"("purpose", "userId", "expiresAt");
CREATE INDEX "VerificationChallenge_purpose_username_expiresAt_idx" ON "VerificationChallenge"("purpose", "username", "expiresAt");
CREATE INDEX "VerificationChallenge_purpose_email_expiresAt_idx" ON "VerificationChallenge"("purpose", "email", "expiresAt");
CREATE INDEX "VerificationChallenge_purpose_verifiedAt_expiresAt_idx" ON "VerificationChallenge"("purpose", "verifiedAt", "expiresAt");

CREATE INDEX "StudySheet_createdAt_idx" ON "StudySheet"("createdAt" DESC);
CREATE INDEX "StudySheet_courseId_createdAt_idx" ON "StudySheet"("courseId", "createdAt" DESC);
CREATE INDEX "StudySheet_userId_createdAt_idx" ON "StudySheet"("userId", "createdAt" DESC);
CREATE INDEX "Comment_sheetId_createdAt_idx" ON "Comment"("sheetId", "createdAt" DESC);
CREATE INDEX "Announcement_pinned_createdAt_idx" ON "Announcement"("pinned", "createdAt" DESC);
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt" DESC);
CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt" DESC);
CREATE INDEX "FeedPost_userId_createdAt_idx" ON "FeedPost"("userId", "createdAt" DESC);
CREATE INDEX "FeedPost_courseId_createdAt_idx" ON "FeedPost"("courseId", "createdAt" DESC);
CREATE INDEX "FeedPostComment_postId_createdAt_idx" ON "FeedPostComment"("postId", "createdAt" DESC);
CREATE INDEX "FeedPostReaction_postId_type_idx" ON "FeedPostReaction"("postId", "type");

ALTER TABLE "VerificationChallenge"
ADD CONSTRAINT "VerificationChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
