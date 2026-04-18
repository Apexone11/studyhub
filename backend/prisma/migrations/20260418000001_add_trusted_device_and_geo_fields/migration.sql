-- CreateTable TrustedDevice — stable device identity across sessions
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIp" VARCHAR(45),
    "lastCountry" VARCHAR(2),
    "lastRegion" VARCHAR(10),
    "trustedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_userId_deviceId_key" ON "TrustedDevice"("userId", "deviceId");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Session — add deviceKind, geo fields, riskScore, trustedDeviceId
ALTER TABLE "Session" ADD COLUMN "deviceKind" VARCHAR(16);
ALTER TABLE "Session" ADD COLUMN "country" VARCHAR(2);
ALTER TABLE "Session" ADD COLUMN "region" VARCHAR(10);
ALTER TABLE "Session" ADD COLUMN "city" VARCHAR(128);
ALTER TABLE "Session" ADD COLUMN "riskScore" INTEGER;
ALTER TABLE "Session" ADD COLUMN "trustedDeviceId" TEXT;

-- AddForeignKey (Session -> TrustedDevice)
ALTER TABLE "Session" ADD CONSTRAINT "Session_trustedDeviceId_fkey" FOREIGN KEY ("trustedDeviceId") REFERENCES "TrustedDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Session_trustedDeviceId_idx" ON "Session"("trustedDeviceId");

-- AlterTable UserPreferences — add security alert prefs
ALTER TABLE "UserPreferences" ADD COLUMN "alertOnNewCountry" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreferences" ADD COLUMN "alertOnNewCity"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPreferences" ADD COLUMN "blockAnonymousIp"  BOOLEAN NOT NULL DEFAULT false;
