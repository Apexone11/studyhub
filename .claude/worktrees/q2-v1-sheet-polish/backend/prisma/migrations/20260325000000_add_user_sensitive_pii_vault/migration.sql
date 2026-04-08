-- CreateTable
CREATE TABLE "UserSensitive" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "encryptedDataKey" TEXT NOT NULL,
    "keyArn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSensitive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSensitive_userId_key" ON "UserSensitive"("userId");

-- AddForeignKey
ALTER TABLE "UserSensitive" ADD CONSTRAINT "UserSensitive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
