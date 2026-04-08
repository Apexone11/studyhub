-- Add terms acceptance tracking fields to User model
ALTER TABLE "User" ADD COLUMN "termsAcceptedVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
