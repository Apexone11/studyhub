-- CreateTable: AiConversation
CREATE TABLE IF NOT EXISTS "AiConversation" (
    "id"        SERIAL       NOT NULL,
    "userId"    INTEGER      NOT NULL,
    "title"     TEXT,
    "model"     TEXT         NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiConversation_userId_updatedAt_idx"
    ON "AiConversation"("userId", "updatedAt" DESC);

ALTER TABLE "AiConversation"
    ADD CONSTRAINT "AiConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AiMessage
CREATE TABLE IF NOT EXISTS "AiMessage" (
    "id"               SERIAL       NOT NULL,
    "conversationId"   INTEGER      NOT NULL,
    "role"             TEXT         NOT NULL,
    "content"          TEXT         NOT NULL,
    "hasImage"         BOOLEAN      NOT NULL DEFAULT false,
    "imageDescription" TEXT,
    "tokenCount"       INTEGER,
    "model"            TEXT,
    "metadata"         JSONB,
    "userId"           INTEGER,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiMessage_conversationId_createdAt_idx"
    ON "AiMessage"("conversationId", "createdAt");

ALTER TABLE "AiMessage"
    ADD CONSTRAINT "AiMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiMessage"
    ADD CONSTRAINT "AiMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AiUsageLog
CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id"           SERIAL  NOT NULL,
    "userId"       INTEGER NOT NULL,
    "date"         DATE    NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCount"   INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiUsageLog_userId_date_key"
    ON "AiUsageLog"("userId", "date");

CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_idx"
    ON "AiUsageLog"("userId");

ALTER TABLE "AiUsageLog"
    ADD CONSTRAINT "AiUsageLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
