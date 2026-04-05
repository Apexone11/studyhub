-- Add isPrivate to User for private account toggle
ALTER TABLE "User" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- Add status to UserFollow for follow requests on private accounts
ALTER TABLE "UserFollow" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
CREATE INDEX "UserFollow_followingId_status_idx" ON "UserFollow"("followingId", "status");

-- Add status to ConversationParticipant for message requests
ALTER TABLE "ConversationParticipant" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
CREATE INDEX "ConversationParticipant_userId_status_idx" ON "ConversationParticipant"("userId", "status");
