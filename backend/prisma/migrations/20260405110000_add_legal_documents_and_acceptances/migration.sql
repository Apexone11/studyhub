CREATE TABLE IF NOT EXISTS "LegalDocument" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "updatedLabel" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'database',
    "termlyEmbedId" TEXT,
    "termlyUrl" TEXT,
    "requiredAtSignup" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LegalAcceptance" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'settings',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LegalAcceptance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegalDocument_slug_version_key" ON "LegalDocument"("slug", "version");
CREATE INDEX IF NOT EXISTS "LegalDocument_slug_isCurrent_publishedAt_idx" ON "LegalDocument"("slug", "isCurrent", "publishedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "LegalAcceptance_userId_documentId_key" ON "LegalAcceptance"("userId", "documentId");
CREATE INDEX IF NOT EXISTS "LegalAcceptance_userId_acceptedAt_idx" ON "LegalAcceptance"("userId", "acceptedAt" DESC);
CREATE INDEX IF NOT EXISTS "LegalAcceptance_documentId_acceptedAt_idx" ON "LegalAcceptance"("documentId", "acceptedAt" DESC);
