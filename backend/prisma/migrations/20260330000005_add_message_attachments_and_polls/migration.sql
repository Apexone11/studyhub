-- CreateTable MessageAttachment
CREATE TABLE "MessageAttachment" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'image',
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable MessagePoll
CREATE TABLE "MessagePoll" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable MessagePollOption
CREATE TABLE "MessagePollOption" (
    "id" SERIAL NOT NULL,
    "pollId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MessagePollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable MessagePollVote
CREATE TABLE "MessagePollVote" (
    "pollId" INTEGER NOT NULL,
    "optionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePollVote_pkey" PRIMARY KEY ("pollId","optionId","userId")
);

-- CreateIndex
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagePoll_messageId_key" ON "MessagePoll"("messageId");

-- CreateIndex
CREATE INDEX "MessagePollOption_pollId_idx" ON "MessagePollOption"("pollId");

-- CreateIndex
CREATE INDEX "MessagePollVote_optionId_idx" ON "MessagePollVote"("optionId");

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePoll" ADD CONSTRAINT "MessagePoll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePollOption" ADD CONSTRAINT "MessagePollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "MessagePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePollVote" ADD CONSTRAINT "MessagePollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MessagePollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePollVote" ADD CONSTRAINT "MessagePollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePollVote" ADD CONSTRAINT "MessagePollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "MessagePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
