-- One-time backfill: mark legacy completed results as seen for both participants.
-- Safe to re-run: only fills NULL seenAt fields on old rows.

UPDATE "Ban"
SET
  "senderResultSeenAt" = COALESCE("senderResultSeenAt", "completedAt", NOW()),
  "receiverResultSeenAt" = COALESCE("receiverResultSeenAt", "completedAt", NOW())
WHERE
  "completedAt" IS NOT NULL
  AND "outcome" IS NOT NULL
  AND "createdAt" < NOW() - INTERVAL '5 minutes'
  AND ("senderResultSeenAt" IS NULL OR "receiverResultSeenAt" IS NULL);
