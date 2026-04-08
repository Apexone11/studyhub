-- CreateTable: Video
CREATE TABLE "Video" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "r2Key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "duration" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "thumbnailR2Key" TEXT,
    "variants" JSONB,
    "hlsManifestR2Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VideoCaption
CREATE TABLE "VideoCaption" (
    "id" SERIAL NOT NULL,
    "videoId" INTEGER NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "label" TEXT NOT NULL,
    "vttR2Key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoCaption_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AnnouncementMedia
CREATE TABLE "AnnouncementMedia" (
    "id" SERIAL NOT NULL,
    "announcementId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "videoId" INTEGER,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PageView (analytics)
CREATE TABLE "PageView" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "path" TEXT NOT NULL,
    "country" VARCHAR(2),
    "device" VARCHAR(20),
    "browser" VARCHAR(50),
    "os" VARCHAR(50),
    "sessionId" VARCHAR(64),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- AlterTable: FeedPost — add videoId column
ALTER TABLE "FeedPost" ADD COLUMN "videoId" INTEGER;

-- CreateIndex: Video
CREATE UNIQUE INDEX "Video_r2Key_key" ON "Video"("r2Key");
CREATE INDEX "Video_userId_createdAt_idx" ON "Video"("userId", "createdAt" DESC);
CREATE INDEX "Video_status_idx" ON "Video"("status");

-- CreateIndex: VideoCaption
CREATE UNIQUE INDEX "VideoCaption_videoId_language_key" ON "VideoCaption"("videoId", "language");
CREATE INDEX "VideoCaption_videoId_idx" ON "VideoCaption"("videoId");

-- CreateIndex: AnnouncementMedia
CREATE INDEX "AnnouncementMedia_announcementId_position_idx" ON "AnnouncementMedia"("announcementId", "position");

-- CreateIndex: PageView
CREATE INDEX "PageView_createdAt_idx" ON "PageView"("createdAt");
CREATE INDEX "PageView_userId_createdAt_idx" ON "PageView"("userId", "createdAt");
CREATE INDEX "PageView_path_idx" ON "PageView"("path");
CREATE INDEX "PageView_sessionId_idx" ON "PageView"("sessionId");

-- AddForeignKey: Video -> User
ALTER TABLE "Video" ADD CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: VideoCaption -> Video
ALTER TABLE "VideoCaption" ADD CONSTRAINT "VideoCaption_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AnnouncementMedia -> Announcement
ALTER TABLE "AnnouncementMedia" ADD CONSTRAINT "AnnouncementMedia_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AnnouncementMedia -> Video
ALTER TABLE "AnnouncementMedia" ADD CONSTRAINT "AnnouncementMedia_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: FeedPost.videoId -> Video
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: PageView -> User
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
