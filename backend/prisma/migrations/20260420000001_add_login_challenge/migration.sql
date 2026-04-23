-- CreateTable LoginChallenge — pending email-code step-up challenge.
-- Created when a login lands in the "challenge" band (score >= 60).
-- codeHash: SHA-256 of the 6-digit code. attempts: # wrong codes, locks at 3.
-- expiresAt: now + 15 minutes.
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "pendingDeviceId" TEXT NOT NULL,
    "codeHash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginChallenge_userId_idx" ON "LoginChallenge"("userId");
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
