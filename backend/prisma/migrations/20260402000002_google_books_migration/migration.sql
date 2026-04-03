-- Migration: Switch library from Gutendex (integer IDs) to Google Books API (string IDs)
-- This drops and recreates the affected tables since no production user data exists
-- for the library feature (Gutendex was unreliable and never fully operational).

-- Drop old tables that used gutenbergId Int
DROP TABLE IF EXISTS "BookHighlight" CASCADE;
DROP TABLE IF EXISTS "BookBookmark" CASCADE;
DROP TABLE IF EXISTS "ReadingProgress" CASCADE;
DROP TABLE IF EXISTS "ShelfBook" CASCADE;
DROP TABLE IF EXISTS "CachedBook" CASCADE;

-- Recreate ShelfBook with volumeId String
CREATE TABLE "ShelfBook" (
    "id" SERIAL NOT NULL,
    "shelfId" INTEGER NOT NULL,
    "volumeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "coverUrl" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShelfBook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShelfBook_shelfId_volumeId_key" ON "ShelfBook"("shelfId", "volumeId");
CREATE INDEX "ShelfBook_shelfId_idx" ON "ShelfBook"("shelfId");
ALTER TABLE "ShelfBook" ADD CONSTRAINT "ShelfBook_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "BookShelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate ReadingProgress with volumeId String
CREATE TABLE "ReadingProgress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "volumeId" TEXT NOT NULL,
    "cfi" TEXT,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingProgress_userId_volumeId_key" ON "ReadingProgress"("userId", "volumeId");
CREATE INDEX "ReadingProgress_userId_idx" ON "ReadingProgress"("userId");
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate BookBookmark with volumeId String
CREATE TABLE "BookBookmark" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "volumeId" TEXT NOT NULL,
    "cfi" TEXT NOT NULL,
    "label" TEXT,
    "pageSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookBookmark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookBookmark_userId_volumeId_idx" ON "BookBookmark"("userId", "volumeId");
ALTER TABLE "BookBookmark" ADD CONSTRAINT "BookBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate BookHighlight with volumeId String
CREATE TABLE "BookHighlight" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "volumeId" TEXT NOT NULL,
    "cfi" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#FFEB3B',
    "note" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookHighlight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookHighlight_userId_volumeId_idx" ON "BookHighlight"("userId", "volumeId");
CREATE INDEX "BookHighlight_volumeId_shared_idx" ON "BookHighlight"("volumeId", "shared");
ALTER TABLE "BookHighlight" ADD CONSTRAINT "BookHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate CachedBook for Google Books data
CREATE TABLE "CachedBook" (
    "id" SERIAL NOT NULL,
    "volumeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" JSONB NOT NULL DEFAULT '[]',
    "categories" JSONB NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'en',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "coverUrl" TEXT,
    "previewLink" TEXT,
    "description" TEXT,
    "publishedDate" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedBook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CachedBook_volumeId_key" ON "CachedBook"("volumeId");
CREATE INDEX "CachedBook_pageCount_idx" ON "CachedBook"("pageCount" DESC);
CREATE INDEX "CachedBook_language_idx" ON "CachedBook"("language");
