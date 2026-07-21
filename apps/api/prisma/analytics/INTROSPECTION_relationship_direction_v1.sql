-- =============================================================================
-- INTROSPECTION_relationship_direction_v1.sql
-- READ-ONLY — run first in Supabase SQL Editor
-- version: 1
-- =============================================================================
-- Goal: extract the exact production direction / share logic used by
-- INITIATIVE and RESPONSIVENESS so resolve_relationship_direction_v1 can be
-- filled without inventing a threshold.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Catalog: analytics functions
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  p.proname as object_name,
  'function'::text as object_type,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_userbyid(p.proowner) as owner_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
order by p.proname;

-- ---------------------------------------------------------------------------
-- B) Catalog: analytics views / matviews
-- ---------------------------------------------------------------------------
select
  schemaname as schema_name,
  viewname as object_name,
  'view'::text as object_type,
  viewowner as owner_name
from pg_views
where schemaname = 'analytics'
order by viewname;

select
  schemaname as schema_name,
  matviewname as object_name,
  'matview'::text as object_type,
  matviewowner as owner_name
from pg_matviews
where schemaname = 'analytics'
order by matviewname;

-- ---------------------------------------------------------------------------
-- C) Full definitions of known / candidate objects
-- ---------------------------------------------------------------------------
-- Run each that exists; comment out missing ones after catalog check.

select pg_get_functiondef('analytics.get_relationship_dashboard_v1'::regproc);

do $$ begin
  perform 'analytics.get_relationship_action_v1'::regproc;
  raise notice '%', pg_get_functiondef('analytics.get_relationship_action_v1'::regproc);
exception when undefined_function then
  raise notice 'get_relationship_action_v1 missing';
end $$;

-- Dynamic view defs for relationship / metric / pair / direction names
select
  format('%I.%I', schemaname, viewname) as qualified_name,
  pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true) as definition
from pg_views
where schemaname = 'analytics'
  and (
    viewname ilike '%relationship%'
    or viewname ilike '%metric%'
    or viewname ilike '%pair%'
    or viewname ilike '%initiative%'
    or viewname ilike '%respons%'
    or viewname ilike '%direction%'
    or viewname ilike '%orb%'
  )
order by viewname;

-- Explicit candidates (ignore errors by checking catalog first):
-- select pg_get_viewdef('analytics.v_relationship_dashboard_v7'::regclass, true);
-- select pg_get_viewdef('analytics.v_relationship_dashboard_v6'::regclass, true);
-- select pg_get_viewdef('analytics.v_relationship_metrics_v0'::regclass, true);
-- select pg_get_viewdef('analytics.v_relationship_metric_values_v1'::regclass, true);

-- ---------------------------------------------------------------------------
-- D) Keyword hunt inside function sources
-- ---------------------------------------------------------------------------
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosrc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and (
    p.prosrc ilike '%INITIATIVE%'
    or p.prosrc ilike '%RESPONSIVENESS%'
    or p.prosrc ilike '%BALANCED%'
    or p.prosrc ilike '%LOW_DATA%'
    or p.prosrc ilike '%viewer_share%'
    or p.prosrc ilike '%other_share%'
    or p.prosrc ilike '%viewerShare%'
    or p.prosrc ilike '%direction%'
    or p.prosrc ilike '%threshold%'
    or p.prosrc ilike '%confidence%'
  )
order by p.proname;

-- ---------------------------------------------------------------------------
-- E) Dependencies of get_relationship_dashboard_v1 (if present)
-- ---------------------------------------------------------------------------
select
  dependent_ns.nspname as dependent_schema,
  dependent_obj.relname as dependent_name,
  dependent_obj.relkind as dependent_kind,
  source_ns.nspname as source_schema,
  source_obj.relname as source_name,
  source_obj.relkind as source_kind
from pg_depend d
join pg_rewrite r on d.objid = r.oid
join pg_class dependent_obj on r.ev_class = dependent_obj.oid
join pg_namespace dependent_ns on dependent_obj.relnamespace = dependent_ns.oid
join pg_class source_obj on d.refobjid = source_obj.oid
join pg_namespace source_ns on source_obj.relnamespace = source_ns.oid
where source_ns.nspname = 'analytics'
   or dependent_ns.nspname = 'analytics'
order by 1, 2
limit 500;

-- ---------------------------------------------------------------------------
-- F) Columns of metric value views (introspect before selecting)
-- ---------------------------------------------------------------------------
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and (
    c.table_name ilike '%metric%'
    or c.table_name ilike '%relationship%'
    or c.table_name ilike '%pair%'
  )
order by c.table_name, c.ordinal_position;

-- ---------------------------------------------------------------------------
-- G) Live dashboard sample (replace user ids after finding test accounts)
-- ---------------------------------------------------------------------------
-- select analytics.get_relationship_dashboard_v1(':viewer_id', ':other_id');
--
-- Inspect relationshipScreen.relationshipOrb.dimensions[] for INITIATIVE /
-- RESPONSIVENESS: viewerShare, otherShare, direction, sampleSize, confidence*.
--
-- Near-equality pairs to hunt after columns are known (DO NOT run blindly):
--   shares ~ 0.50/0.50, 0.51/0.49, 0.52/0.48, 0.55/0.45
-- Build those SELECTs only after step F reveals column names.

-- ---------------------------------------------------------------------------
-- H) Paste back to agent
-- ---------------------------------------------------------------------------
-- 1) Full direction CASE / function body used by INITIATIVE and RESPONSIVENESS
-- 2) Exact threshold / LOW_DATA / confidence rules
-- 3) Whether both metrics share one helper
-- 4) Sample JSON dimensions for a real pair
-- 5) Any near-equality examples with resulting direction
-- =============================================================================
