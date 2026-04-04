-- Sprint E: Pro-level payment features
-- Adds referral codes, gift subscriptions, and subscription pause tables.

-- ── ReferralCode ────────────────────────────────────────────────────────

CREATE TABLE "ReferralCode" (
    "id"          SERIAL       NOT NULL,
    "code"        TEXT         NOT NULL,
    "ownerId"     INTEGER      NOT NULL,
    "rewardType"  TEXT         NOT NULL DEFAULT 'trial_extension',
    "rewardValue" INTEGER      NOT NULL DEFAULT 7,
    "maxUses"     INTEGER      NOT NULL DEFAULT 0,
    "currentUses" INTEGER      NOT NULL DEFAULT 0,
    "expiresAt"   TIMESTAMP(3),
    "active"      BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE INDEX "ReferralCode_ownerId_idx" ON "ReferralCode"("ownerId");
CREATE INDEX "ReferralCode_code_idx" ON "ReferralCode"("code");

ALTER TABLE "ReferralCode"
    ADD CONSTRAINT "ReferralCode_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ReferralRedemption ──────────────────────────────────────────────────

CREATE TABLE "ReferralRedemption" (
    "id"             SERIAL       NOT NULL,
    "referralCodeId" INTEGER      NOT NULL,
    "redeemedById"   INTEGER      NOT NULL,
    "redeemedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralRedemption_referralCodeId_redeemedById_key"
    ON "ReferralRedemption"("referralCodeId", "redeemedById");
CREATE INDEX "ReferralRedemption_redeemedById_idx" ON "ReferralRedemption"("redeemedById");

ALTER TABLE "ReferralRedemption"
    ADD CONSTRAINT "ReferralRedemption_referralCodeId_fkey"
    FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralRedemption"
    ADD CONSTRAINT "ReferralRedemption_redeemedById_fkey"
    FOREIGN KEY ("redeemedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── GiftSubscription ────────────────────────────────────────────────────

CREATE TABLE "GiftSubscription" (
    "id"              SERIAL       NOT NULL,
    "gifterId"        INTEGER      NOT NULL,
    "recipientEmail"  TEXT         NOT NULL,
    "recipientId"     INTEGER,
    "plan"            TEXT         NOT NULL DEFAULT 'pro_monthly',
    "durationMonths"  INTEGER      NOT NULL DEFAULT 1,
    "message"         TEXT,
    "stripeSessionId" TEXT,
    "status"          TEXT         NOT NULL DEFAULT 'pending',
    "giftCode"        TEXT         NOT NULL,
    "expiresAt"       TIMESTAMP(3),
    "redeemedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiftSubscription_stripeSessionId_key" ON "GiftSubscription"("stripeSessionId");
CREATE UNIQUE INDEX "GiftSubscription_giftCode_key" ON "GiftSubscription"("giftCode");
CREATE INDEX "GiftSubscription_gifterId_idx" ON "GiftSubscription"("gifterId");
CREATE INDEX "GiftSubscription_recipientId_idx" ON "GiftSubscription"("recipientId");
CREATE INDEX "GiftSubscription_giftCode_idx" ON "GiftSubscription"("giftCode");
CREATE INDEX "GiftSubscription_recipientEmail_idx" ON "GiftSubscription"("recipientEmail");

ALTER TABLE "GiftSubscription"
    ADD CONSTRAINT "GiftSubscription_gifterId_fkey"
    FOREIGN KEY ("gifterId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiftSubscription"
    ADD CONSTRAINT "GiftSubscription_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SubscriptionPause ───────────────────────────────────────────────────

CREATE TABLE "SubscriptionPause" (
    "id"        SERIAL       NOT NULL,
    "userId"    INTEGER      NOT NULL,
    "reason"    TEXT,
    "pausedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumeAt"  TIMESTAMP(3) NOT NULL,
    "resumedAt" TIMESTAMP(3),
    "status"    TEXT         NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPause_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionPause_userId_idx" ON "SubscriptionPause"("userId");
CREATE INDEX "SubscriptionPause_status_idx" ON "SubscriptionPause"("status");

ALTER TABLE "SubscriptionPause"
    ADD CONSTRAINT "SubscriptionPause_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
