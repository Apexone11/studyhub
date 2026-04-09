-- Phase 6 Step 2: Performance indexes for scaling
-- These target the highest-traffic query patterns identified in the Phase 6 plan.

-- Speed up sheet listing with course + status filters
-- (schoolId is on the Course table, not StudySheet; join through courseId)
CREATE INDEX IF NOT EXISTS idx_study_sheet_course_status
  ON "StudySheet" ("courseId", "status");

-- Speed up fork lookups (only for sheets that are forks)
CREATE INDEX IF NOT EXISTS idx_study_sheet_fork_of
  ON "StudySheet" ("forkOf") WHERE "forkOf" IS NOT NULL;

-- Speed up contribution queries by target sheet and status
CREATE INDEX IF NOT EXISTS idx_contribution_sheet_status
  ON "SheetContribution" ("targetSheetId", "status", "createdAt");

-- Speed up user feed (recent sheets by a specific author)
-- Column is "userId", not "authorId"
CREATE INDEX IF NOT EXISTS idx_study_sheet_author_created
  ON "StudySheet" ("userId", "createdAt" DESC);

-- Speed up note listing by user and course
CREATE INDEX IF NOT EXISTS idx_note_user_course
  ON "Note" ("userId", "courseId", "createdAt" DESC);

-- Speed up message queries within a conversation
CREATE INDEX IF NOT EXISTS idx_message_conversation_created
  ON "Message" ("conversationId", "createdAt" DESC);

-- Speed up block/mute lookups (bidirectional checks)
CREATE INDEX IF NOT EXISTS idx_user_block_blocker
  ON "UserBlock" ("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS idx_user_mute_muter
  ON "UserMute" ("muterId", "mutedId");
