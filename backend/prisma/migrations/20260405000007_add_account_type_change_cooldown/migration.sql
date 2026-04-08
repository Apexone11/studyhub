-- Add account type change cooldown fields
ALTER TABLE "User" ADD COLUMN "pendingAccountType" TEXT;
ALTER TABLE "User" ADD COLUMN "accountTypeChangedAt" TIMESTAMP(3);
