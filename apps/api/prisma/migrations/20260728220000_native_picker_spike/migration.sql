-- SPIKE: native Telegram request_users / users_shared diagnostic table
CREATE TABLE IF NOT EXISTS "NativePickerSpikeRequest" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "ownerTelegramId" BIGINT NOT NULL,
  "telegramRequestId" INTEGER NOT NULL,
  "preparedButtonId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "selectedUserId" BIGINT,
  "selectedFirstName" TEXT,
  "selectedLastName" TEXT,
  "selectedUsername" TEXT,
  "hasPhotoMeta" BOOLEAN NOT NULL DEFAULT false,
  "messageFromId" BIGINT,
  "registeredInApp" BOOLEAN,
  "rawUsersShared" JSONB,
  "requestChatCallback" BOOLEAN,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "NativePickerSpikeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NativePickerSpikeRequest_ownerUserId_status_idx"
  ON "NativePickerSpikeRequest"("ownerUserId", "status");
CREATE INDEX IF NOT EXISTS "NativePickerSpikeRequest_ownerTelegramId_telegramRequestId_idx"
  ON "NativePickerSpikeRequest"("ownerTelegramId", "telegramRequestId");
CREATE INDEX IF NOT EXISTS "NativePickerSpikeRequest_expiresAt_idx"
  ON "NativePickerSpikeRequest"("expiresAt");
