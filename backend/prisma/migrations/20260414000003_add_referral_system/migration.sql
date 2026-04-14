-- AlterTable: Add referral fields to User
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByUserId" INTEGER;
ALTER TABLE "User" ADD COLUMN "proRewardExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "inviterId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "channel" TEXT NOT NULL,
    "invitedUserId" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referral_inviterId_idx" ON "Referral"("inviterId");
CREATE INDEX "Referral_email_idx" ON "Referral"("email");
CREATE INDEX "Referral_code_idx" ON "Referral"("code");
CREATE INDEX "Referral_acceptedAt_idx" ON "Referral"("acceptedAt");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "milestone" INTEGER NOT NULL,
    "proMonths" INTEGER NOT NULL,
    "badgeKey" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_userId_milestone_key" ON "ReferralReward"("userId", "milestone");
CREATE INDEX "ReferralReward_userId_idx" ON "ReferralReward"("userId");

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
