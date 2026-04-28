-- Phase R1 / Task #64 — additive UserSchoolEnrollment schema.
--
-- This is the additive half of the dual-enrollment cutover. Today,
-- school membership is derived implicitly from a user's enrolled
-- courses (Enrollment -> Course -> School). That works for single-
-- school students but cannot represent dual-enrolled or self-learner
-- users that browse multiple schools.
--
-- This migration adds the table only. NO backfill. NO read cutover.
-- Both belong to subsequent phases:
--   R2 — backfill existing memberships from courses.
--   R3 — switch read paths to the new table and deprecate the
--        Enrollment-derived inference.
--
-- Until R3, this table can be written-to optionally (e.g., in
-- onboarding step 2 once a follow-up wires it in), but nothing reads
-- from it. Safe to deploy on its own.
--
-- IF NOT EXISTS guards mirror the pattern in
-- 20260428000003_add_preview_text_to_study_sheet so a manual hot-fix
-- in any environment doesn't conflict with this migration.

CREATE TABLE IF NOT EXISTS "UserSchoolEnrollment" (
  "id"        SERIAL       PRIMARY KEY,
  "userId"    INTEGER      NOT NULL,
  "schoolId"  INTEGER      NOT NULL,
  "role"      VARCHAR(32)  NOT NULL DEFAULT 'student',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserSchoolEnrollment_userId_fkey"
    FOREIGN KEY ("userId")  REFERENCES "User"   ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserSchoolEnrollment_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSchoolEnrollment_userId_schoolId_key"
  ON "UserSchoolEnrollment" ("userId", "schoolId");

CREATE INDEX IF NOT EXISTS "UserSchoolEnrollment_schoolId_idx"
  ON "UserSchoolEnrollment" ("schoolId");
