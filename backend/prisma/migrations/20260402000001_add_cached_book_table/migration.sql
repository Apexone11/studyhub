-- CreateTable: CachedBook
CREATE TABLE "CachedBook" (
    "id" SERIAL NOT NULL,
    "gutenbergId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "authors" JSONB NOT NULL DEFAULT '[]',
    "subjects" JSONB NOT NULL DEFAULT '[]',
    "languages" JSONB NOT NULL DEFAULT '[]',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "coverUrl" TEXT,
    "formats" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CachedBook_gutenbergId_key" ON "CachedBook"("gutenbergId");
CREATE INDEX "CachedBook_downloadCount_idx" ON "CachedBook"("downloadCount" DESC);
CREATE INDEX "CachedBook_languages_idx" ON "CachedBook"("languages");
