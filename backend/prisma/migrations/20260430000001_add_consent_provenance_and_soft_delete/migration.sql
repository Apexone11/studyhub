-- Add provenance + soft-delete to CreatorAuditConsent.
--
-- acceptanceMethod: tells auditors whether a row was created by a real
--   user click ('user'), the production backfill script ('backfill'),
--   or local seed fixtures ('seed').
-- revokedAt: nullable timestamp. Revocation sets this instead of deleting
--   the row, preserving the audit trail for legal disputes. Active
--   consent is now: revokedAt IS NULL AND docVersion = current version.

ALTER TABLE "CreatorAuditConsent"
  ADD COLUMN "acceptanceMethod" VARCHAR(16) NOT NULL DEFAULT 'user',
  ADD COLUMN "revokedAt" TIMESTAMP(3);

-- No new index needed: userId already carries a unique constraint, which
-- materializes a B-tree the planner uses for the only access pattern
-- (lookup by user). A partial index on the same column would be fully
-- shadowed by the unique index and only add write amplification.
