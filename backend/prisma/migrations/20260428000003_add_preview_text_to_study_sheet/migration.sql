-- Adds previewText: a server-extracted short summary of the sheet
-- content used by the Sheets Grid view card. Nullable on purpose so
-- existing rows are valid until backfillPreviewText.js runs. Read
-- paths must handle NULL gracefully (fall back to description or '').
--
-- IF NOT EXISTS makes this safe to re-run after a manual hot-fix on
-- any environment, matching the pattern set by
-- 20260428000002_add_review_comment_to_contributions.

ALTER TABLE "StudySheet"
  ADD COLUMN IF NOT EXISTS "previewText" VARCHAR(280);
