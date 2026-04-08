-- Add processing progress tracking and downloadable toggle to Video table
ALTER TABLE "Video" ADD COLUMN "processingStep" TEXT;
ALTER TABLE "Video" ADD COLUMN "processingProgress" INTEGER;
ALTER TABLE "Video" ADD COLUMN "downloadable" BOOLEAN NOT NULL DEFAULT true;
