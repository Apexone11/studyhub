CREATE TABLE "EmailSuppressionAudit" (
    "id" SERIAL NOT NULL,
    "suppressionId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "performedByUserId" INTEGER,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppressionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSuppressionAudit_suppressionId_createdAt_idx" ON "EmailSuppressionAudit"("suppressionId", "createdAt" DESC);
CREATE INDEX "EmailSuppressionAudit_performedByUserId_createdAt_idx" ON "EmailSuppressionAudit"("performedByUserId", "createdAt" DESC);
CREATE INDEX "EmailSuppressionAudit_action_createdAt_idx" ON "EmailSuppressionAudit"("action", "createdAt" DESC);

ALTER TABLE "EmailSuppressionAudit"
ADD CONSTRAINT "EmailSuppressionAudit_suppressionId_fkey"
FOREIGN KEY ("suppressionId") REFERENCES "EmailSuppression"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailSuppressionAudit"
ADD CONSTRAINT "EmailSuppressionAudit_performedByUserId_fkey"
FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
