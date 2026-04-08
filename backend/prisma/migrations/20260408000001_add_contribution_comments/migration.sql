-- CreateTable
CREATE TABLE "ContributionComment" (
    "id" SERIAL NOT NULL,
    "contributionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "hunkIndex" INTEGER NOT NULL,
    "lineOffset" INTEGER NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'new',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContributionComment_contributionId_hunkIndex_idx"
    ON "ContributionComment"("contributionId", "hunkIndex");

-- CreateIndex
CREATE INDEX "ContributionComment_userId_createdAt_idx"
    ON "ContributionComment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContributionComment"
    ADD CONSTRAINT "ContributionComment_contributionId_fkey"
    FOREIGN KEY ("contributionId") REFERENCES "SheetContribution"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionComment"
    ADD CONSTRAINT "ContributionComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
