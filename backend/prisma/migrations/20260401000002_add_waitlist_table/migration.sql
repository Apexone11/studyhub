-- CreateTable: Waitlist
CREATE TABLE "Waitlist" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_email_tier_key" ON "Waitlist"("email", "tier");
CREATE INDEX "Waitlist_email_idx" ON "Waitlist"("email");
CREATE INDEX "Waitlist_tier_idx" ON "Waitlist"("tier");
