-- Multi-attachment support for feed posts (plan: docs/internal/plans/feed-multi-attachments.md)
-- Idempotent per CLAUDE.md A5: safe to re-run on retry.

CREATE TABLE IF NOT EXISTS "FeedPostAttachment" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeedPostAttachment_postId_position_idx"
    ON "FeedPostAttachment"("postId", "position");

DO $$
BEGIN
    ALTER TABLE "FeedPostAttachment"
        ADD CONSTRAINT "FeedPostAttachment_postId_fkey"
        FOREIGN KEY ("postId") REFERENCES "FeedPost"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: existing single-attachment posts become one-row attachment lists
-- so the new read path is uniform. Re-run safe via the NOT EXISTS guard.
INSERT INTO "FeedPostAttachment" ("postId", "url", "type", "name", "position")
SELECT p."id", p."attachmentUrl", COALESCE(p."attachmentType", 'file'), COALESCE(p."attachmentName", 'Attachment'), 0
FROM "FeedPost" p
WHERE p."attachmentUrl" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "FeedPostAttachment" a WHERE a."postId" = p."id"
  );
