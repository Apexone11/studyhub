CREATE TABLE IF NOT EXISTS "CreatorAuditConsent" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "docVersion" VARCHAR(16) NOT NULL,
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(512),
  CONSTRAINT "CreatorAuditConsent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreatorAuditConsent_userId_key"
  ON "CreatorAuditConsent" ("userId");