-- Wave-12.11 — Session.mfaVerifiedAt
--
-- Adds a nullable timestamp column to Session. Set when the user
-- completes the email-OTP challenge (loginChallenge.consume) OR
-- redeems a recovery code OR hits POST /api/auth/mfa/step-up.
-- requireRecentMfa middleware compares this to NOW() and 403s if the
-- gap exceeds the per-route window (default 15 min).
--
-- Closes the L2.14 deferred admin-MFA step-up plan. The column is
-- nullable so existing sessions don't need to be re-issued — the
-- middleware treats NULL as "never verified" which 403s on the
-- protected route, sending the admin through the step-up flow.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS so re-running the migration
-- after a partial deploy is safe (CLAUDE.md A5).

ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "mfaVerifiedAt" TIMESTAMP(3);
