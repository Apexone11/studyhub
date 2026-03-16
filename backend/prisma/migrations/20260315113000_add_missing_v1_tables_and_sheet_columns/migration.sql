-- Add missing StudySheet upload columns expected by the current schema.
ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "StudySheet" ADD COLUMN IF NOT EXISTS "attachmentType" TEXT;

-- Comments on study sheets.
CREATE TABLE IF NOT EXISTS "Comment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- Per-user stars on sheets.
CREATE TABLE IF NOT EXISTS "StarredSheet" (
    "userId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    CONSTRAINT "StarredSheet_pkey" PRIMARY KEY ("userId","sheetId")
);

-- Password reset tokens.
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Public/admin announcements.
CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- Unique constraints required by Prisma queries.
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "StarredSheet_userId_sheetId_key" ON "StarredSheet"("userId", "sheetId");

-- Foreign keys for Comment.
ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_sheetId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_userId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys for StarredSheet.
ALTER TABLE "StarredSheet" DROP CONSTRAINT IF EXISTS "StarredSheet_userId_fkey";
ALTER TABLE "StarredSheet" ADD CONSTRAINT "StarredSheet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StarredSheet" DROP CONSTRAINT IF EXISTS "StarredSheet_sheetId_fkey";
ALTER TABLE "StarredSheet" ADD CONSTRAINT "StarredSheet_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys for PasswordResetToken.
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_userId_fkey";
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys for Announcement.
ALTER TABLE "Announcement" DROP CONSTRAINT IF EXISTS "Announcement_authorId_fkey";
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
