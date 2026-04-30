-- Migration: add LegalRequest table for DSAR (CCPA / GDPR) durability.
-- The /api/legal/data-request endpoint persists every submission here
-- BEFORE attempting the email send, so a transient SMTP / Resend
-- outage cannot lose a compliance request.

CREATE TABLE "LegalRequest" (
    "id" SERIAL PRIMARY KEY,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "law" TEXT NOT NULL,
    "message" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ON DELETE SET NULL on the resolver ref so deleting the resolving
-- admin user doesn't cascade-delete the audit row. Compliance
-- requests must outlive any single user record.
ALTER TABLE "LegalRequest"
    ADD CONSTRAINT "LegalRequest_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LegalRequest_createdAt_idx" ON "LegalRequest"("createdAt");
CREATE INDEX "LegalRequest_requestType_idx" ON "LegalRequest"("requestType");
CREATE INDEX "LegalRequest_resolvedAt_idx" ON "LegalRequest"("resolvedAt");
CREATE INDEX "LegalRequest_requesterEmail_idx" ON "LegalRequest"("requesterEmail");
