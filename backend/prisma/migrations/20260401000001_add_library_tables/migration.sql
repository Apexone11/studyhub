-- CreateTable: BookShelf
CREATE TABLE "BookShelf" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookShelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ShelfBook
CREATE TABLE "ShelfBook" (
    "id" SERIAL NOT NULL,
    "shelfId" INTEGER NOT NULL,
    "gutenbergId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "coverUrl" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShelfBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReadingProgress
CREATE TABLE "ReadingProgress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "gutenbergId" INTEGER NOT NULL,
    "cfi" TEXT,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BookBookmark
CREATE TABLE "BookBookmark" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "gutenbergId" INTEGER NOT NULL,
    "cfi" TEXT NOT NULL,
    "label" TEXT,
    "pageSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BookHighlight
CREATE TABLE "BookHighlight" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "gutenbergId" INTEGER NOT NULL,
    "cfi" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#FFEB3B',
    "note" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookShelf_userId_name_key" ON "BookShelf"("userId", "name");
CREATE INDEX "BookShelf_userId_idx" ON "BookShelf"("userId");

CREATE UNIQUE INDEX "ShelfBook_shelfId_gutenbergId_key" ON "ShelfBook"("shelfId", "gutenbergId");
CREATE INDEX "ShelfBook_shelfId_idx" ON "ShelfBook"("shelfId");

CREATE UNIQUE INDEX "ReadingProgress_userId_gutenbergId_key" ON "ReadingProgress"("userId", "gutenbergId");
CREATE INDEX "ReadingProgress_userId_idx" ON "ReadingProgress"("userId");

CREATE INDEX "BookBookmark_userId_gutenbergId_idx" ON "BookBookmark"("userId", "gutenbergId");

CREATE INDEX "BookHighlight_userId_gutenbergId_idx" ON "BookHighlight"("userId", "gutenbergId");
CREATE INDEX "BookHighlight_gutenbergId_shared_idx" ON "BookHighlight"("gutenbergId", "shared");

-- AddForeignKey
ALTER TABLE "BookShelf" ADD CONSTRAINT "BookShelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShelfBook" ADD CONSTRAINT "ShelfBook_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "BookShelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookBookmark" ADD CONSTRAINT "BookBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookHighlight" ADD CONSTRAINT "BookHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
