-- AlterTable: add emailHash column to User for encrypted email lookup
ALTER TABLE "User" ADD COLUMN "emailHash" TEXT;

-- CreateIndex: index on emailHash for fast lookups
CREATE INDEX "User_emailHash_idx" ON "User"("emailHash");
