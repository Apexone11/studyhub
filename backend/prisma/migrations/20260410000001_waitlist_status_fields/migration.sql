-- Phase 0: Waitlist lifecycle tracking
ALTER TABLE "Waitlist" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'waiting';
ALTER TABLE "Waitlist" ADD COLUMN "invitedAt" TIMESTAMP(3);
ALTER TABLE "Waitlist" ADD COLUMN "convertedAt" TIMESTAMP(3);
ALTER TABLE "Waitlist" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Waitlist_status_createdAt_idx" ON "Waitlist"("status", "createdAt");
