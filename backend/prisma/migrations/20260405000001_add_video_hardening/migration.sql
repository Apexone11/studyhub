-- Add content hash and watermark position to Video
ALTER TABLE "Video" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Video" ADD COLUMN "watermarkPosition" TEXT;

-- Index for fast duplicate lookups
CREATE INDEX "Video_contentHash_idx" ON "Video"("contentHash");

-- VideoAppeal table for plagiarism dispute resolution
CREATE TABLE "VideoAppeal" (
    "id" SERIAL NOT NULL,
    "videoId" INTEGER NOT NULL,
    "uploaderId" INTEGER NOT NULL,
    "originalVideoId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "reviewedBy" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAppeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoAppeal_videoId_idx" ON "VideoAppeal"("videoId");
CREATE INDEX "VideoAppeal_uploaderId_idx" ON "VideoAppeal"("uploaderId");
CREATE INDEX "VideoAppeal_status_idx" ON "VideoAppeal"("status");

ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_originalVideoId_fkey" FOREIGN KEY ("originalVideoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
