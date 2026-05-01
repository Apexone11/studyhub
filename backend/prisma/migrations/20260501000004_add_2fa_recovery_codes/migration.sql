-- Migration: 2FA recovery codes columns on User. Plain v1 schema (NIST
-- 800-63B AAL2 alt-factor pattern) — bcrypt-hashed codes only, never
-- the plaintext. Plaintext is shown ONCE at generation time and never
-- stored.
--
-- Idempotent (IF NOT EXISTS) so a redeploy or partial-apply replays
-- cleanly.

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "twoFaRecoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "twoFaRecoveryGeneratedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "twoFaRecoveryUsedCount" INTEGER NOT NULL DEFAULT 0;
