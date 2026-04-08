-- Add moderationStatus to Note and NoteComment for content moderation visibility control.
-- Default 'clean' means published and visible. 'pending_review' hides from public until admin clears.

ALTER TABLE "Note" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'clean';
ALTER TABLE "NoteComment" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'clean';
