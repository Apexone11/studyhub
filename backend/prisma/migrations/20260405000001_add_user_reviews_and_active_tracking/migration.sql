-- Add lastActiveAt to User for tracking active users
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

-- Create UserReview table for homepage testimonials
CREATE TABLE "UserReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "aiClassification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserReview_userId_key" ON "UserReview"("userId");
CREATE INDEX "UserReview_status_stars_idx" ON "UserReview"("status", "stars");
CREATE INDEX "UserReview_createdAt_idx" ON "UserReview"("createdAt");

ALTER TABLE "UserReview" ADD CONSTRAINT "UserReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
