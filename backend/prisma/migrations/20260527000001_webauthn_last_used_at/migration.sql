-- Wave-12.11 — WebAuthnCredential.lastUsedAt
--
-- Adds a nullable timestamp column to WebAuthnCredential so the admin
-- portal can show "last used" per passkey, and so we have an audit
-- signal for unused passkeys that should be retired. Written every
-- time the credential verifies successfully in webauthn.routes.js.
--
-- Originally part of the L2.14 deferred plan for admin MFA. Implemented
-- standalone in wave-12.11 because the column is useful on its own (no
-- behavioural change to the verify path beyond the additional write).
--
-- Idempotency: ADD COLUMN IF NOT EXISTS so re-running the migration
-- after a partial deploy is safe (CLAUDE.md A5).

ALTER TABLE "WebAuthnCredential"
  ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
