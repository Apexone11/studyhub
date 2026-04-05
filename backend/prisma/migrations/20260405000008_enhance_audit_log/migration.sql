-- AlterTable: Add resource, resourceId, details, ipAddress to AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "resource" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "resourceId" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "details" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "ipAddress" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");
