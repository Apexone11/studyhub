-- V1 Complete — adds 2FA fields, Note, Notification, UserFollow, Reaction, DeletionReason

-- Add 2FA fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFaCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFaExpiry" TIMESTAMP(3);

-- Note table
CREATE TABLE IF NOT EXISTS "Note" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "userId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "private" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- Notification table
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "actorId" INTEGER,
    "sheetId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- UserFollow table
CREATE TABLE IF NOT EXISTS "UserFollow" (
    "followerId" INTEGER NOT NULL,
    "followingId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- Reaction table
CREATE TABLE IF NOT EXISTS "Reaction" (
    "userId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("userId","sheetId")
);

-- DeletionReason table
CREATE TABLE IF NOT EXISTS "DeletionReason" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletionReason_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for Note
ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "Note_userId_fkey";
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "Note_courseId_fkey";
ALTER TABLE "Note" ADD CONSTRAINT "Note_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys for Notification
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_actorId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys for UserFollow
ALTER TABLE "UserFollow" DROP CONSTRAINT IF EXISTS "UserFollow_followerId_fkey";
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followerId_fkey"
    FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFollow" DROP CONSTRAINT IF EXISTS "UserFollow_followingId_fkey";
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followingId_fkey"
    FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys for Reaction
ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_userId_fkey";
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_sheetId_fkey";
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
