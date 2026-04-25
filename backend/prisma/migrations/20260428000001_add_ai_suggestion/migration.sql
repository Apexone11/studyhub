-- Phase 3 — AI Suggestion Card.
-- One row per generated suggestion for the inline Hub AI card on
-- UserProfilePage Overview. Cross-session dismissals + analytics
-- value drove the schema decision (locked PERSIST in the Phase 3
-- handoff, 2026-04-24).
--
-- userId + generatedAt index serves the "fetch current suggestion"
-- query (most recent undismissed row per user).
-- userId + dismissedAt index serves the "fetch only undismissed"
-- variant if we add a separate listing endpoint later.
-- ON DELETE CASCADE keeps the table self-cleaning when a user is
-- removed.

CREATE TABLE "AiSuggestion" (
  "id"          SERIAL        PRIMARY KEY,
  "userId"      INTEGER       NOT NULL,
  "text"        VARCHAR(280)  NOT NULL,
  "ctaLabel"    VARCHAR(40)   NOT NULL,
  "ctaAction"   VARCHAR(40)   NOT NULL,
  "generatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dismissedAt" TIMESTAMP(3),
  CONSTRAINT "AiSuggestion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiSuggestion_userId_generatedAt_idx"
  ON "AiSuggestion"("userId", "generatedAt");

CREATE INDEX "AiSuggestion_userId_dismissedAt_idx"
  ON "AiSuggestion"("userId", "dismissedAt");
