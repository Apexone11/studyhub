-- Migration: admin MFA enforcement scaffolding.
--
-- Adds two columns on User. The login flow checks `mfaRequired` for
-- admins and forces them through 2FA setup before issuing a session.
-- `mfaEnforcedAt` is the timestamp that mfaRequired was set, used by
-- the audit log + admin dashboard.
--
-- Idempotent (IF NOT EXISTS) so a redeploy or partial-apply replays
-- cleanly.

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "mfaEnforcedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_mfaRequired_idx" ON "User"("mfaRequired") WHERE "mfaRequired" = true;
