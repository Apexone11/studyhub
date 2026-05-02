-- Add User.passwordSetByUser so we can distinguish:
--   - email-registered users (true — they chose their password)
--   - password-reset users (true — they chose a new one via the email link)
--   - Google-signup users (false — passwordHash is a random unknown value)
--
-- Without this flag, Google-only users get stuck in two ways:
--   1. The DELETE /api/settings/account flow asks for a password to
--      confirm; bcrypt.compare(input, randomHash) is always false, so
--      they can never delete their account (GDPR right-to-erasure
--      violation).
--   2. They can't fall back to email/password login if Google is
--      unavailable, because they don't know the random password.
--
-- The fix is a one-time post-signup "set your password" step in
-- onboarding. Existing Google users see the same step the first time
-- they hit a sensitive flow.
--
-- Default false for ALL existing rows so legacy Google users land in
-- the "must set password" branch on next login. Email-registered users
-- are bumped to true by a one-shot UPDATE below — they already chose
-- their own password during registration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'passwordSetByUser'
  ) THEN
    ALTER TABLE "User"
      ADD COLUMN "passwordSetByUser" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Backfill: every existing local-auth user (authProvider = 'local')
-- chose their own password at registration. Mark them as such so they
-- aren't forced through the "set password" step on their next login.
-- Google users (authProvider = 'google') are left at false intentionally.
UPDATE "User"
SET "passwordSetByUser" = true
WHERE "authProvider" = 'local'
  AND "passwordSetByUser" = false;
