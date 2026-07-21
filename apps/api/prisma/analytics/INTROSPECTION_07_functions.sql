-- =============================================================================
-- INTROSPECTION_07_functions.sql
-- purpose: analytics function inventory, then targeted definitions only
-- expected output: compact list (≤100), then defs for name-matched functions
-- run order: 5
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- A) Compact inventory (no definitions)
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.format_type(p.prorettype, null) as return_type,
  l.lanname as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'analytics'
order by p.proname, identity_arguments
limit 100;

-- B) Targeted candidates (names only)
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.format_type(p.prorettype, null) as return_type,
  l.lanname as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'analytics'
  and (
    p.proname ilike '%relationship%'
    or p.proname ilike '%dashboard%'
    or p.proname ilike '%metric%'
    or p.proname ilike '%direction%'
    or p.proname ilike '%confidence%'
    or p.proname ilike '%relative%'
    or p.proname ilike '%dimension%'
    or p.proname ilike '%profile%'
    or p.proname ilike '%insight%'
    or p.proname ilike '%calculation%'
  )
order by p.proname, identity_arguments
limit 100;

-- C) Definitions — one rowset limited to targeted names (small set)
-- If this still OOMs, run one function at a time using the inventory list.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and (
    p.proname ilike '%relationship%'
    or p.proname ilike '%dashboard%'
    or p.proname ilike '%metric%'
    or p.proname ilike '%direction%'
    or p.proname ilike '%confidence%'
    or p.proname ilike '%relative%'
    or p.proname ilike '%dimension%'
    or p.proname ilike '%profile%'
    or p.proname ilike '%insight%'
    or p.proname ilike '%calculation%'
  )
order by p.proname, identity_arguments
limit 50;

-- Optional single-function template (commented — uncomment one name as needed):
-- select pg_get_functiondef(
--   (select p.oid from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'analytics'
--      and p.proname = 'get_relationship_dashboard_v1'
--    limit 1)
-- );
