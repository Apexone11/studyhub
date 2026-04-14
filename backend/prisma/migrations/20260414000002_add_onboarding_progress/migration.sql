-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "schoolSelected" BOOLEAN NOT NULL DEFAULT false,
    "coursesAdded" INTEGER NOT NULL DEFAULT 0,
    "firstActionType" TEXT,
    "invitesSent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_completedAt_idx" ON "OnboardingProgress"("completedAt");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
