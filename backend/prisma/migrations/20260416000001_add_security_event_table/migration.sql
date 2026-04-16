-- CreateTable
CREATE TABLE "SecurityEvent" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");
CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType");
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
