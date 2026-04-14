-- CreateTable
CREATE TABLE "RequestMetric" (
    "id" SERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "routeGroup" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestMetric_routeGroup_createdAt_idx" ON "RequestMetric"("routeGroup", "createdAt");

-- CreateIndex
CREATE INDEX "RequestMetric_createdAt_idx" ON "RequestMetric"("createdAt");
