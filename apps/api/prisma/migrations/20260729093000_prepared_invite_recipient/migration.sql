-- Prepared invite-ban: compose first, recipient claims later by token.
CREATE TYPE "BanInviteRecipientMode" AS ENUM ('USERNAME', 'KNOWN_BY_SENDER');

ALTER TABLE "BanInvite"
  ALTER COLUMN "targetUsername" DROP NOT NULL,
  ADD COLUMN "recipientMode" "BanInviteRecipientMode" NOT NULL DEFAULT 'USERNAME',
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "tone" TEXT;

CREATE UNIQUE INDEX "BanInvite_senderId_clientRequestId_key"
  ON "BanInvite"("senderId", "clientRequestId");
