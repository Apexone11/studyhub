-- CreateTable: SheetCommit (Sheet Lab version control)
CREATE TABLE IF NOT EXISTS "SheetCommit" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "contentFormat" TEXT NOT NULL DEFAULT 'markdown',
    "checksum" TEXT NOT NULL,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProvenanceManifest (encrypted origin tokens)
CREATE TABLE IF NOT EXISTS "ProvenanceManifest" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "originHash" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvenanceManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FeatureFlag
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WebAuthnCredential (passkeys for admin users)
CREATE TABLE IF NOT EXISTS "WebAuthnCredential" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Passkey',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SheetCommit indexes
CREATE INDEX IF NOT EXISTS "SheetCommit_sheetId_createdAt_idx" ON "SheetCommit"("sheetId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SheetCommit_userId_createdAt_idx" ON "SheetCommit"("userId", "createdAt" DESC);

-- CreateIndex: ProvenanceManifest unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "ProvenanceManifest_sheetId_key" ON "ProvenanceManifest"("sheetId");

-- CreateIndex: FeatureFlag unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_name_key" ON "FeatureFlag"("name");

-- CreateIndex: WebAuthnCredential indexes
CREATE UNIQUE INDEX IF NOT EXISTS "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");
CREATE INDEX IF NOT EXISTS "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- AddForeignKey: SheetCommit -> StudySheet
ALTER TABLE "SheetCommit" ADD CONSTRAINT "SheetCommit_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SheetCommit -> User
ALTER TABLE "SheetCommit" ADD CONSTRAINT "SheetCommit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SheetCommit -> SheetCommit (parent)
ALTER TABLE "SheetCommit" ADD CONSTRAINT "SheetCommit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SheetCommit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ProvenanceManifest -> StudySheet
ALTER TABLE "ProvenanceManifest" ADD CONSTRAINT "ProvenanceManifest_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "StudySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WebAuthnCredential -> User
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
