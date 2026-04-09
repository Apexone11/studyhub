-- Make GroupAuditLog.actorId nullable so system-automated actions
-- (auto-lock, auto-ban) can be recorded without a FK to a real user.

ALTER TABLE "GroupAuditLog" ALTER COLUMN "actorId" DROP NOT NULL;

-- Change the FK from CASCADE to SET NULL so deleting a user doesn't
-- destroy their audit trail.
ALTER TABLE "GroupAuditLog" DROP CONSTRAINT "GroupAuditLog_actorId_fkey";
ALTER TABLE "GroupAuditLog"
    ADD CONSTRAINT "GroupAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
