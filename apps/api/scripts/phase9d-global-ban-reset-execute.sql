-- =============================================================================
-- STAGE 8 PHASE 9D — GLOBAL BAN RESET — EXECUTE (ONE TRANSACTION)
-- =============================================================================
-- Path: apps/api/scripts/phase9d-global-ban-reset-execute.sql
--
-- FOR SUPABASE SQL EDITOR — DO NOT RUN until preview reviewed and approved.
--
-- Scope: ALL users / ALL pairs.
-- Journal: DELETE rows only — NEVER RESTART IDENTITY / ALTER SEQUENCE / setval.
-- Preserves: User, SocialContact, Payment, Entitlement, SelfBan, Plan, Product,
--            User.energy, settings, auth, referral ownership.
--
-- AnalyticsEvent names deleted (Ban-related only — not a broad wipe):
--   ban_sent, ban_accepted, ban_rejected, ban_counter, ban_overboard,
--   check_answered, check_timeout, check_ignored, result_shared
-- Excluded: session_recovered (not proven Ban-only; no Ban-scoped producer)
--
-- BanThread is exclusively Ban-owned (every Ban.threadId → BanThread);
-- after Ban=0, all BanThread rows are deleted.
--
-- Any failed assertion RAISE EXCEPTION → full transaction rollback.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  user_before bigint;
  social_before bigint;
  payment_before bigint;
  entitlement_before bigint;
  selfban_before bigint;
  user_after bigint;
  social_after bigint;
  payment_after bigint;
  entitlement_after bigint;
  selfban_after bigint;
  n bigint;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Protected baselines (no tables created)
  -- -------------------------------------------------------------------------
  SELECT COUNT(*) INTO user_before FROM "User";
  SELECT COUNT(*) INTO social_before FROM "SocialContact";
  SELECT COUNT(*) INTO payment_before FROM "Payment";
  SELECT COUNT(*) INTO entitlement_before FROM "Entitlement";
  SELECT COUNT(*) INTO selfban_before FROM "SelfBan";

  -- -------------------------------------------------------------------------
  -- 2. Soft Ban string references
  -- -------------------------------------------------------------------------
  UPDATE "BanInvite"
  SET "banId" = NULL
  WHERE "banId" IS NOT NULL;

  UPDATE "BotRetentionLog"
  SET "banId" = NULL
  WHERE "banId" IS NOT NULL;

  -- -------------------------------------------------------------------------
  -- 3. Ban self-references
  -- -------------------------------------------------------------------------
  UPDATE "Ban"
  SET "parentBanId" = NULL
  WHERE "parentBanId" IS NOT NULL;

  -- -------------------------------------------------------------------------
  -- 4. Ban children
  -- -------------------------------------------------------------------------
  DELETE FROM "BanCheckAnswer";
  DELETE FROM "SavedBan";

  -- -------------------------------------------------------------------------
  -- 5. All Ban rows (global)
  -- -------------------------------------------------------------------------
  DELETE FROM "Ban";

  -- -------------------------------------------------------------------------
  -- 6. BanThread exclusively Ban-owned → delete all after Ban=0
  -- -------------------------------------------------------------------------
  DELETE FROM "BanThread";

  -- -------------------------------------------------------------------------
  -- 7. Journal contents — DELETE only (identity / sequence preserved)
  --    FORBIDDEN: TRUNCATE ... RESTART IDENTITY, ALTER SEQUENCE, setval(...)
  -- -------------------------------------------------------------------------
  DELETE FROM "NotificationJournalEntry";

  -- -------------------------------------------------------------------------
  -- 8. Ban-derived pair economy
  -- -------------------------------------------------------------------------
  DELETE FROM "PairDailyStat";

  -- -------------------------------------------------------------------------
  -- 9. Explicit Ban-named analytics only
  -- -------------------------------------------------------------------------
  DELETE FROM "AnalyticsEvent"
  WHERE "name" IN (
    'ban_sent', 'ban_accepted', 'ban_rejected', 'ban_counter', 'ban_overboard',
    'check_answered', 'check_timeout', 'check_ignored', 'result_shared'
  );

  -- -------------------------------------------------------------------------
  -- 10. Assertions (failure → RAISE → full ROLLBACK of this transaction)
  -- -------------------------------------------------------------------------
  SELECT COUNT(*) INTO n FROM "Ban";
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: Ban count = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "BanCheckAnswer";
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: BanCheckAnswer count = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "SavedBan";
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: SavedBan count = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "NotificationJournalEntry";
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: NotificationJournalEntry count = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "BanInvite" WHERE "banId" IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: BanInvite with banId = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "BotRetentionLog" WHERE "banId" IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: BotRetentionLog with banId = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "PairDailyStat";
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: PairDailyStat count = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "BanThread";
  IF n <> 0 THEN
    RAISE EXCEPTION 'phase9d assert failed: BanThread count = % (expected 0)', n;
  END IF;

  SELECT COUNT(*) INTO user_after FROM "User";
  IF user_after <> user_before THEN
    RAISE EXCEPTION 'phase9d assert failed: User count changed % → %', user_before, user_after;
  END IF;

  SELECT COUNT(*) INTO social_after FROM "SocialContact";
  IF social_after <> social_before THEN
    RAISE EXCEPTION 'phase9d assert failed: SocialContact count changed % → %', social_before, social_after;
  END IF;

  SELECT COUNT(*) INTO payment_after FROM "Payment";
  IF payment_after <> payment_before THEN
    RAISE EXCEPTION 'phase9d assert failed: Payment count changed % → %', payment_before, payment_after;
  END IF;

  SELECT COUNT(*) INTO entitlement_after FROM "Entitlement";
  IF entitlement_after <> entitlement_before THEN
    RAISE EXCEPTION 'phase9d assert failed: Entitlement count changed % → %', entitlement_before, entitlement_after;
  END IF;

  SELECT COUNT(*) INTO selfban_after FROM "SelfBan";
  IF selfban_after <> selfban_before THEN
    RAISE EXCEPTION 'phase9d assert failed: SelfBan count changed % → %', selfban_before, selfban_after;
  END IF;

  RAISE NOTICE 'phase9d reset OK: Ban/Journal cleared; protected counts unchanged (User=%, SocialContact=%, Payment=%, Entitlement=%, SelfBan=%)',
    user_after, social_after, payment_after, entitlement_after, selfban_after;
END $$;

COMMIT;

-- Post-commit: re-run phase9d-global-ban-reset-preview.sql
-- Confirm sequence_last_value was NOT reset to 1 / start.
-- Do NOT create a test Ban until API + Web are deployed and healthy.
