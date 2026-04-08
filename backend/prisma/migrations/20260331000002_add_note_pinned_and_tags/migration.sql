-- Add missing pinned and tags columns to Note table
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "tags" TEXT NOT NULL DEFAULT '[]';
