-- Add permanentlyDeletedAt to ModerationSnapshot (tracks 30-day cleanup)
ALTER TABLE "ModerationSnapshot" ADD COLUMN "permanentlyDeletedAt" TIMESTAMP(3);
