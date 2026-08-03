-- CreateTable
CREATE TABLE "NotificationJournalEntry" (
    "revision" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemSequence" BIGINT,
    "itemKind" TEXT,
    "banId" TEXT,
    "deliveryPolicy" TEXT,
    "causedByItemId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationJournalEntry_pkey" PRIMARY KEY ("revision")
);

-- CreateIndex
CREATE INDEX "NotificationJournalEntry_userId_revision_idx" ON "NotificationJournalEntry"("userId", "revision");

-- CreateIndex
CREATE INDEX "NotificationJournalEntry_userId_itemId_revision_idx" ON "NotificationJournalEntry"("userId", "itemId", "revision");

-- AddForeignKey
ALTER TABLE "NotificationJournalEntry" ADD CONSTRAINT "NotificationJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
