-- WHO native first-contact (request_users) sessions
CREATE TABLE IF NOT EXISTS "WhoFirstContactRequest" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "ownerTelegramId" BIGINT NOT NULL,
  "telegramRequestId" INTEGER NOT NULL,
  "preparedButtonId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "selectedTelegramId" BIGINT,
  "selectedFirstName" TEXT,
  "selectedLastName" TEXT,
  "selectedUsername" TEXT,
  "hasPhotoMeta" BOOLEAN NOT NULL DEFAULT false,
  "friendCardJson" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),

  CONSTRAINT "WhoFirstContactRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhoFirstContactRequest_token_key"
  ON "WhoFirstContactRequest"("token");
CREATE INDEX IF NOT EXISTS "WhoFirstContactRequest_ownerUserId_status_idx"
  ON "WhoFirstContactRequest"("ownerUserId", "status");
CREATE INDEX IF NOT EXISTS "WhoFirstContactRequest_ownerTelegramId_telegramRequestId_idx"
  ON "WhoFirstContactRequest"("ownerTelegramId", "telegramRequestId");
CREATE INDEX IF NOT EXISTS "WhoFirstContactRequest_expiresAt_idx"
  ON "WhoFirstContactRequest"("expiresAt");
