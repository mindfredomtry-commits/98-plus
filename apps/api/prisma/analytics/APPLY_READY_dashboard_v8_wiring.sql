-- =============================================================================
-- APPLY_READY_dashboard_v8_wiring.sql
-- status: DO NOT APPLY / DO NOT RUN IN PRODUCTION
-- version: 1.0
-- =============================================================================
-- Purpose:
--   Switch analytics.get_relationship_dashboard_v1 from
--     analytics.v_relationship_dashboard_v7
--   to
--     analytics.v_relationship_dashboard_v8
--
--   Single logical change only. Signature, return type, JSON contract,
--   SECURITY, search_path, and GRANTs must be preserved verbatim.
--
-- Prerequisites (apply BEFORE this wiring patch):
--   1) APPLY_READY_dashboard_v8.sql  → CREATE VIEW v_relationship_dashboard_v8
--   2) Golden-pair validation on v8 view
--
-- Apply order (manual, later — only after explicit approval):
--   1) Run PART 0 introspection in Supabase SQL Editor (read-only)
--   2) Paste pg_get_functiondef output into PART 1 slot
--   3) Apply PART 1 CREATE OR REPLACE (single v7 → v8 substitution)
--   4) Run PART 2 validation queries
--
-- Repo findings (no live DB in workspace):
--   - Wiring object: analytics.get_relationship_dashboard_v1 (PostgreSQL function)
--   - API call site: apps/api/src/services/relationship-analytics.service.ts
--   - API does NOT reference v7/v8 views directly — only the SQL function
--   - Full function body is NOT stored in git; capture via pg_get_functiondef
--
-- ALL executable SQL below is inside block comments. Do not uncomment until approved.
-- =============================================================================

-- #############################################################################
-- PART 0 — READ-ONLY INTROSPECTION (run first; paste results for audit)
-- #############################################################################

/*
-- A) Object catalog
select
  n.nspname as schema_name,
  p.proname as object_name,
  'function'::text as object_type,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.format_type(p.prorettype, null) as return_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  pg_get_userbyid(p.proowner) as owner_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and p.proname = 'get_relationship_dashboard_v1';

-- B) Full current definition (PASTE THIS OUTPUT into PART 1 before apply)
select pg_get_functiondef('analytics.get_relationship_dashboard_v1'::regproc) as current_definition;

-- C) Locate v7 reference inside function source
select
  p.proname,
  strpos(p.prosrc, 'v_relationship_dashboard_v7') as v7_position,
  substring(
    p.prosrc
    from greatest(strpos(p.prosrc, 'v_relationship_dashboard_v7') - 80, 1)
    for 200
  ) as v7_context_snippet
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and p.proname = 'get_relationship_dashboard_v1';

-- D) Direct dependencies (1-hop from function → referenced objects)
select distinct
  dependent_ns.nspname as dependent_schema,
  dependent_proc.proname as dependent_name,
  'function'::text as dependent_type,
  source_ns.nspname as source_schema,
  source_obj.relname as source_name,
  case source_obj.relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    else source_obj.relkind::text
  end as source_type
from pg_depend d
join pg_proc dependent_proc on d.objid = dependent_proc.oid
join pg_namespace dependent_ns on dependent_proc.pronamespace = dependent_ns.oid
join pg_class source_obj on d.refobjid = source_obj.oid
join pg_namespace source_ns on source_obj.relnamespace = source_ns.oid
where dependent_ns.nspname = 'analytics'
  and dependent_proc.proname = 'get_relationship_dashboard_v1'
  and source_obj.relkind in ('v', 'm', 'r')
order by source_schema, source_name;

-- E) Grants on function (preserve after CREATE OR REPLACE)
select
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'analytics'
  and routine_name = 'get_relationship_dashboard_v1'
order by grantee, privilege_type;
*/

-- #############################################################################
-- PART 1 — CREATE OR REPLACE FUNCTION (apply after introspection)
-- #############################################################################
--
-- INSTRUCTIONS:
--   1) Run PART 0B and copy the full pg_get_functiondef output.
--   2) Replace EXACTLY (case-sensitive, qualified name):
--        analytics.v_relationship_dashboard_v7
--      with:
--        analytics.v_relationship_dashboard_v8
--   3) Do NOT change anything else (signature, LANGUAGE, STABLE/VOLATILE,
--      SECURITY DEFINER/INVOKER, SET search_path, body logic, GRANTs).
--   4) Uncomment and execute the resulting CREATE OR REPLACE FUNCTION.
--
-- If PART 0B body matches the canonical thin wrapper below, you may use the
-- pre-built patch in PART 1B instead — but ONLY after byte-for-byte confirmation
-- against pg_get_functiondef (SECURITY + search_path lines must match production).
--
-- ---------------------------------------------------------------------------
-- PART 1A — paste slot (preferred: production definition with v7 → v8)
-- ---------------------------------------------------------------------------
/*
-- >>> PASTE pg_get_functiondef output here, with v7 → v8 substitution <<<
-- Example shape only — NOT authoritative until confirmed by PART 0B:
--
-- CREATE OR REPLACE FUNCTION analytics.get_relationship_dashboard_v1(
--   p_viewer_user_id text,
--   p_other_user_id text
-- )
-- RETURNS jsonb
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER          -- copy from production; may differ
-- SET search_path TO ...    -- copy from production; may differ
-- AS $function$
--   ...
--   from analytics.v_relationship_dashboard_v8 d   -- was v7
--   ...
-- $function$;
*/

-- ---------------------------------------------------------------------------
-- PART 1B — canonical thin-wrapper candidate (UNCONFIRMED — verify first)
-- ---------------------------------------------------------------------------
-- Confirmed public signature (repo + integration spec):
--   analytics.get_relationship_dashboard_v1(
--     p_viewer_user_id text,
--     p_other_user_id text
--   ) returns jsonb
--
-- Expected v7 reference site (from dashboard architecture):
--   FROM analytics.v_relationship_dashboard_v7 d
--   WHERE d.viewer_user_id = p_viewer_user_id
--     AND d.other_user_id = p_other_user_id
--
-- Apply ONLY if PART 0B matches this body apart from SECURITY/search_path lines.
/*
create or replace function analytics.get_relationship_dashboard_v1(
  p_viewer_user_id text,
  p_other_user_id text
)
returns jsonb
language sql
stable
as $function$
  select d.dashboard_payload
  from analytics.v_relationship_dashboard_v8 d
  where d.viewer_user_id = p_viewer_user_id
    and d.other_user_id = p_other_user_id
  limit 1
$function$;
*/

-- ---------------------------------------------------------------------------
-- PART 1C — re-apply grants (run ONLY if CREATE OR REPLACE reset privileges)
-- ---------------------------------------------------------------------------
-- Copy grant statements from PART 0E output. Example shape — do not guess grantees:
/*
grant execute on function analytics.get_relationship_dashboard_v1(text, text) to authenticated;
grant execute on function analytics.get_relationship_dashboard_v1(text, text) to service_role;
*/

-- =============================================================================
-- PRE-APPLY CHECKLIST
-- =============================================================================
-- □ PART 0B captured full pg_get_functiondef
-- □ Only substitution: v_relationship_dashboard_v7 → v_relationship_dashboard_v8
-- □ Function signature unchanged: (text, text) → jsonb
-- □ SECURITY DEFINER / INVOKER unchanged vs production
-- □ SET search_path unchanged vs production
-- □ GRANTs re-applied if needed (PART 0E vs post-replace)
-- □ v_relationship_dashboard_v7 view NOT dropped
-- □ APPLY_READY_dashboard_v8.sql view already applied
-- □ SQL fully commented until manual uncomment
-- □ Production not changed by this file alone
-- =============================================================================

-- #############################################################################
-- PART 2 — READ-ONLY VALIDATION (after CREATE OR REPLACE)
-- #############################################################################

/*
-- Golden pair smoke (function returns scalar jsonb — use scalar select)
select
  analytics.get_relationship_dashboard_v1(
    'cmpg2eide000etkgwbhkwjb5z',
    'cmpiebpwt00rgpk0p87dyblug'
  ) as dashboard_payload;

-- User-requested form (works when wrapped; scalar jsonb is not a row source):
select *
from analytics.get_relationship_dashboard_v1(
  'cmpg2eide000etkgwbhkwjb5z',
  'cmpiebpwt00rgpk0p87dyblug'
) as dashboard_payload;

-- Confirm v8 wiring: relationshipScreen should expose RESPECT (not THIRD_DIMENSION_PENDING)
select
  analytics.get_relationship_dashboard_v1(
    'cmpg2eide000etkgwbhkwjb5z',
    'cmpiebpwt00rgpk0p87dyblug'
  ) #>> '{relationshipScreen,relationshipOrb,dimensions,2,code}' as inner_ring_code,
  analytics.get_relationship_dashboard_v1(
    'cmpg2eide000etkgwbhkwjb5z',
    'cmpiebpwt00rgpk0p87dyblug'
  ) -> 'meta' ->> 'dashboardVersion' as dashboard_version;

-- Dependency check: function should now reference v8, not v7
select
  strpos(p.prosrc, 'v_relationship_dashboard_v8') > 0 as references_v8,
  strpos(p.prosrc, 'v_relationship_dashboard_v7') > 0 as still_references_v7
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and p.proname = 'get_relationship_dashboard_v1';
*/
