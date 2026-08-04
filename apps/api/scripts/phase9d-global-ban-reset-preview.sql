-- =============================================================================
-- STAGE 8 PHASE 9D — GLOBAL BAN RESET — PREVIEW (SELECT ONLY)
-- =============================================================================
-- Path: apps/api/scripts/phase9d-global-ban-reset-preview.sql
--
-- FOR SUPABASE SQL EDITOR — PREPARE / REVIEW ONLY.
-- Rules: SELECT only. No BEGIN / DELETE / UPDATE / TRUNCATE / ALTER / CREATE.
-- No mutation of any kind.
--
-- After execute, re-run this preview to verify affected counts are zero and
-- capture Journal sequence last_value (identity must NOT have been restarted).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- AFFECTED + PRESERVED TABLE COUNTS
-- ---------------------------------------------------------------------------
SELECT 'Ban' AS table_name, COUNT(*)::bigint AS n FROM "Ban"
UNION ALL SELECT 'BanCheckAnswer', COUNT(*)::bigint FROM "BanCheckAnswer"
UNION ALL SELECT 'SavedBan', COUNT(*)::bigint FROM "SavedBan"
UNION ALL SELECT 'BanThread', COUNT(*)::bigint FROM "BanThread"
UNION ALL SELECT 'NotificationJournalEntry', COUNT(*)::bigint FROM "NotificationJournalEntry"
UNION ALL SELECT 'BanInvite_with_banId', COUNT(*)::bigint FROM "BanInvite" WHERE "banId" IS NOT NULL
UNION ALL SELECT 'BanInvite_total', COUNT(*)::bigint FROM "BanInvite"
UNION ALL SELECT 'BotRetentionLog_with_banId', COUNT(*)::bigint FROM "BotRetentionLog" WHERE "banId" IS NOT NULL
UNION ALL SELECT 'PairDailyStat', COUNT(*)::bigint FROM "PairDailyStat"
UNION ALL SELECT 'AnalyticsEvent_ban_named', COUNT(*)::bigint FROM "AnalyticsEvent"
  WHERE "name" IN (
    'ban_sent', 'ban_accepted', 'ban_rejected', 'ban_counter', 'ban_overboard',
    'check_answered', 'check_timeout', 'check_ignored', 'result_shared'
  )
UNION ALL SELECT 'SelfBan', COUNT(*)::bigint FROM "SelfBan"
UNION ALL SELECT 'User', COUNT(*)::bigint FROM "User"
UNION ALL SELECT 'SocialContact', COUNT(*)::bigint FROM "SocialContact"
UNION ALL SELECT 'Payment', COUNT(*)::bigint FROM "Payment"
UNION ALL SELECT 'Entitlement', COUNT(*)::bigint FROM "Entitlement"
UNION ALL SELECT 'Plan', COUNT(*)::bigint FROM "Plan"
UNION ALL SELECT 'Product', COUNT(*)::bigint FROM "Product"
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- Ban by status / outcome
-- ---------------------------------------------------------------------------
SELECT "status"::text AS ban_status, COUNT(*)::bigint AS n
FROM "Ban"
GROUP BY "status"
ORDER BY 1;

SELECT COALESCE("outcome"::text, '(null)') AS ban_outcome, COUNT(*)::bigint AS n
FROM "Ban"
GROUP BY "outcome"
ORDER BY 1;

SELECT COUNT(*)::bigint AS timeout_ban_count
FROM "Ban"
WHERE "outcome" = 'TIMEOUT';

SELECT COUNT(*)::bigint AS overboard_ban_count
FROM "Ban"
WHERE "outcome" = 'OVERBOARD' OR "status" = 'OVERBOARD' OR "isOverboard" = true;

-- ---------------------------------------------------------------------------
-- Notification Journal identity / contents
-- ---------------------------------------------------------------------------
SELECT COALESCE(MAX("revision"), 0)::bigint AS max_journal_revision
FROM "NotificationJournalEntry";

-- Sequence state (must survive execute DELETE — last_value must NOT reset to 1)
SELECT
  pg_get_serial_sequence('"NotificationJournalEntry"', 'revision') AS sequence_name,
  (SELECT last_value FROM pg_sequences
    WHERE schemaname = 'public'
      AND sequencename = regexp_replace(
        pg_get_serial_sequence('"NotificationJournalEntry"', 'revision'),
        '^public\.',
        ''
      )
  ) AS sequence_last_value;

SELECT COALESCE("itemKind", '(null)') AS item_kind, COUNT(*)::bigint AS n
FROM "NotificationJournalEntry"
GROUP BY "itemKind"
ORDER BY 1;

SELECT "operationType" AS operation_type, COUNT(*)::bigint AS n
FROM "NotificationJournalEntry"
GROUP BY "operationType"
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- Capture this max_journal_revision and sequence_last_value before execute.
-- After execute + first new Ban: new Journal revision MUST be > pre-reset max.
-- ---------------------------------------------------------------------------
