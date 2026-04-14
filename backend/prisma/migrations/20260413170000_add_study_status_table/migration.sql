-- CreateTable
CREATE TABLE "StudyStatus" (
    "userId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyStatus_pkey" PRIMARY KEY ("userId","sheetId")
);

-- CreateIndex
CREATE INDEX "StudyStatus_userId_status_idx" ON "StudyStatus"("userId", "status");

-- CreateIndex
CREATE INDEX "StudyStatus_sheetId_idx" ON "StudyStatus"("sheetId");

-- AddForeignKey
ALTER TABLE "StudyStatus" ADD CONSTRAINT "StudyStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyStatus" ADD CONSTRAINT "StudyStatus_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
