-- =============================================================================
-- STAGE 8 PHASE 9C — GLOBAL BAN + NOTIFICATION JOURNAL RESET
-- =============================================================================
-- FOR SUPABASE SQL EDITOR — PREPARE ONLY.
-- DO NOT EXECUTE until explicitly approved after Phase 9C review.
--
-- Scope: ALL users / ALL pairs (global — not pair-scoped).
--
-- Deletes / clears:
--   Ban, BanCheckAnswer, SavedBan, BanThread,
--   NotificationJournalEntry (TRUNCATE RESTART IDENTITY),
--   PairDailyStat, BanInvite.banId, BotRetentionLog.banId,
--   Ban-named AnalyticsEvent rows only.
--
-- Preserves:
--   User, SocialContact, Payment, Entitlement, Plan, Product, SelfBan,
--   authentication / settings / referral ownership.
--
-- Constraints for this script:
--   - no CREATE TABLE / TEMP TABLE / VIEW / FUNCTION
--   - ordinary DELETE / UPDATE only
--   - single transaction; any error → full rollback
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PRE-COUNTS
-- ---------------------------------------------------------------------------
SELECT 'Ban' AS table_name, COUNT(*)::bigint AS n FROM "Ban"
UNION ALL SELECT 'BanCheckAnswer', COUNT(*)::bigint FROM "BanCheckAnswer"
UNION ALL SELECT 'SavedBan', COUNT(*)::bigint FROM "SavedBan"
UNION ALL SELECT 'BanThread', COUNT(*)::bigint FROM "BanThread"
UNION ALL SELECT 'NotificationJournalEntry', COUNT(*)::bigint FROM "NotificationJournalEntry"
UNION ALL SELECT 'BanInvite_with_banId', COUNT(*)::bigint FROM "BanInvite" WHERE "banId" IS NOT NULL
UNION ALL SELECT 'BotRetentionLog_with_banId', COUNT(*)::bigint FROM "BotRetentionLog" WHERE "banId" IS NOT NULL
UNION ALL SELECT 'PairDailyStat', COUNT(*)::bigint FROM "PairDailyStat"
UNION ALL SELECT 'AnalyticsEvent_ban_named', COUNT(*)::bigint FROM "AnalyticsEvent"
  WHERE "name" IN (
    'ban_sent', 'ban_accepted', 'ban_rejected', 'ban_counter', 'ban_overboard',
    'check_answered', 'check_timeout', 'check_ignored', 'result_shared',
    'session_recovered'
  )
UNION ALL SELECT 'SelfBan', COUNT(*)::bigint FROM "SelfBan"
UNION ALL SELECT 'User', COUNT(*)::bigint FROM "User"
UNION ALL SELECT 'SocialContact', COUNT(*)::bigint FROM "SocialContact"
UNION ALL SELECT 'Payment', COUNT(*)::bigint FROM "Payment"
UNION ALL SELECT 'Entitlement', COUNT(*)::bigint FROM "Entitlement"
ORDER BY 1;

-- Record preserved baselines in the result grid (compare manually after DELETE):
-- User / SocialContact / Payment / Entitlement / SelfBan must match post-counts.

-- ---------------------------------------------------------------------------
-- DESTRUCTIVE STATEMENTS (FK-safe order)
-- ---------------------------------------------------------------------------

-- Soft string Ban refs (no FK on these columns)
UPDATE "BanInvite" SET "banId" = NULL WHERE "banId" IS NOT NULL;
UPDATE "BotRetentionLog" SET "banId" = NULL WHERE "banId" IS NOT NULL;

-- Self-referential Ban tree
UPDATE "Ban" SET "parentBanId" = NULL WHERE "parentBanId" IS NOT NULL;

-- Ban children (also ON DELETE CASCADE from Ban; explicit for clarity)
DELETE FROM "BanCheckAnswer";
DELETE FROM "SavedBan";

-- All Ban rows (global)
DELETE FROM "Ban";

-- BanThread is Ban-owned (every Ban references a thread); empty after Ban delete
DELETE FROM "BanThread";

-- Notifications Journal — empty truthful Sync baseline; reset identity so
-- post-deploy revisions start clean (DELETE alone leaves the sequence high).
TRUNCATE TABLE "NotificationJournalEntry" RESTART IDENTITY;

-- Ban-derived pair economy (fun-mode / daily farm) — clear for clean tests
DELETE FROM "PairDailyStat";

-- Ban-named analytics only (NOT a broad AnalyticsEvent wipe)
DELETE FROM "AnalyticsEvent"
WHERE "name" IN (
  'ban_sent', 'ban_accepted', 'ban_rejected', 'ban_counter', 'ban_overboard',
  'check_answered', 'check_timeout', 'check_ignored', 'result_shared',
  'session_recovered'
);

-- ---------------------------------------------------------------------------
-- POST VERIFICATION (expected zeros / preserved)
-- ---------------------------------------------------------------------------
SELECT 'Ban' AS table_name, COUNT(*)::bigint AS n FROM "Ban"
UNION ALL SELECT 'BanCheckAnswer', COUNT(*)::bigint FROM "BanCheckAnswer"
UNION ALL SELECT 'SavedBan', COUNT(*)::bigint FROM "SavedBan"
UNION ALL SELECT 'BanThread', COUNT(*)::bigint FROM "BanThread"
UNION ALL SELECT 'NotificationJournalEntry', COUNT(*)::bigint FROM "NotificationJournalEntry"
UNION ALL SELECT 'BanInvite_with_banId', COUNT(*)::bigint FROM "BanInvite" WHERE "banId" IS NOT NULL
UNION ALL SELECT 'BotRetentionLog_with_banId', COUNT(*)::bigint FROM "BotRetentionLog" WHERE "banId" IS NOT NULL
UNION ALL SELECT 'PairDailyStat', COUNT(*)::bigint FROM "PairDailyStat"
UNION ALL SELECT 'AnalyticsEvent_ban_named', COUNT(*)::bigint FROM "AnalyticsEvent"
  WHERE "name" IN (
    'ban_sent', 'ban_accepted', 'ban_rejected', 'ban_counter', 'ban_overboard',
    'check_answered', 'check_timeout', 'check_ignored', 'result_shared',
    'session_recovered'
  )
UNION ALL SELECT 'SelfBan', COUNT(*)::bigint FROM "SelfBan"
UNION ALL SELECT 'User', COUNT(*)::bigint FROM "User"
UNION ALL SELECT 'SocialContact', COUNT(*)::bigint FROM "SocialContact"
UNION ALL SELECT 'Payment', COUNT(*)::bigint FROM "Payment"
UNION ALL SELECT 'Entitlement', COUNT(*)::bigint FROM "Entitlement"
ORDER BY 1;

-- Expected after DELETE:
--   Ban = 0
--   BanCheckAnswer = 0
--   SavedBan = 0
--   BanThread = 0
--   NotificationJournalEntry = 0
--   BanInvite_with_banId = 0
--   BotRetentionLog_with_banId = 0
--   PairDailyStat = 0
--   AnalyticsEvent_ban_named = 0
--   User > 0
--   SocialContact / Payment / Entitlement / SelfBan unchanged vs PRE-COUNTS

-- SAFETY: this script contains NO:
--   DELETE FROM "User"
--   DELETE FROM "SocialContact"
--   DELETE FROM "Payment"
--   DELETE FROM "Entitlement"
--   DELETE FROM "SelfBan"

-- Finish ONLY after verifying the post SELECT in this same session:
--   COMMIT;
-- If anything is wrong:
--   ROLLBACK;
