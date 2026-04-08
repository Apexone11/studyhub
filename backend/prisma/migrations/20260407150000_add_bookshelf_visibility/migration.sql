ALTER TABLE "BookShelf"
ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';

CREATE INDEX "BookShelf_userId_visibility_idx" ON "BookShelf"("userId", "visibility");