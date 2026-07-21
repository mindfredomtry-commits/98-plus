-- =============================================================================
-- INTROSPECTION_relationship_definitions_v1.sql
-- version: 1
-- mode: READ-ONLY
-- =============================================================================
-- SUPERSEDED FOR MANUAL EXECUTION BY SPLIT INTROSPECTION FILES
-- because monolithic execution may exhaust PostgreSQL temporary disk
-- (ERROR 53100: No space left on device / pgsql_tmp).
--
-- Prefer the split files:
--   INTROSPECTION_01_dashboard_v7.sql … INTROSPECTION_09_dashboard_dependencies.sql
-- Keep this file as an archival reference only — do not run whole-file in Supabase.
--
-- Purpose: dump full definitions of existing analytics views/functions so the
-- Relationship Analytics Engine can be studied without guessing.
--
-- SAFE: SELECT / DO-notice only. No CREATE / ALTER / DROP / APPLY.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Sanity: list everything in schema analytics first
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'f' then 'foreign'
    when 'p' then 'partitioned'
    else c.relkind::text
  end as object_type,
  pg_get_userbyid(c.relowner) as owner_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'analytics'
  and c.relkind in ('r', 'v', 'm', 'f', 'p')
order by object_type, object_name;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_userbyid(p.proowner) as owner_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
order by p.proname, 3;

-- ---------------------------------------------------------------------------
-- 1) VIEW DEFINITIONS — named candidates (one row per existing view)
--    Uses to_regclass so missing names do not abort the batch.
-- ---------------------------------------------------------------------------
with wanted(view_name) as (
  values
    ('v_relationship_dashboard_v7'),
    ('v_relationship_dashboard_v6'),
    ('v_relationship_dashboard_v5'),
    ('v_relationship_dashboard_v4'),
    ('v_relationship_dashboard_v3'),
    ('v_relationship_dashboard_v2'),
    ('v_relationship_dashboard_v1'),
    ('v_relationship_metric_values_v1'),
    ('v_relationship_metrics_v0'),
    ('v_relationship_profile_v1'),
    ('v_relationship_position_v0'),
    ('v_relationship_explanation_facts_v0'),
    ('v_relationship_narrative_v1'),
    ('v_relationship_insights_v1'),
    ('v_relationship_patterns_v1'),
    ('v_relationship_recommendations_v1'),
    ('v_pair_summary'),
    ('v_pair_reply_count'),
    ('v_pair_survived_count'),
    ('v_pair_overboard_count'),
    ('v_pair_both_no_count'),
    ('v_pair_split_count'),
    ('v_pair_timeout_count')
)
select
  w.view_name,
  case
    when to_regclass(format('analytics.%I', w.view_name)) is null
      then 'MISSING'
    else 'EXISTS'
  end as status,
  case
    when to_regclass(format('analytics.%I', w.view_name)) is null
      then null
    else pg_get_viewdef(format('analytics.%I', w.view_name)::regclass, true)
  end as view_definition
from wanted w
order by w.view_name;

-- All analytics views (catch anything not in the named list)
select
  schemaname as schema_name,
  viewname as view_name,
  viewowner as owner_name,
  pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true) as view_definition
from pg_views
where schemaname = 'analytics'
order by viewname;

-- Materialized views in analytics (if any)
select
  schemaname as schema_name,
  matviewname as matview_name,
  matviewowner as owner_name,
  definition as matview_definition
from pg_matviews
where schemaname = 'analytics'
order by matviewname;

-- ---------------------------------------------------------------------------
-- 2) FUNCTION DEFINITIONS — every function in schema analytics
-- ---------------------------------------------------------------------------
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.format_type(p.prorettype, null) as return_type,
  l.lanname as language,
  p.provolatile as volatility_code, -- i=immutable, s=stable, v=volatile
  p.prokind as kind_code,           -- f=function, p=procedure, a=agg, w=window
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'analytics'
order by p.proname, arguments;

-- ---------------------------------------------------------------------------
-- 3) KEYWORD SEARCH inside view definitions
-- ---------------------------------------------------------------------------
with view_defs as (
  select
    schemaname as schema_name,
    viewname as object_name,
    'view'::text as object_type,
    pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true) as definition
  from pg_views
  where schemaname = 'analytics'
),
keywords(keyword) as (
  values
    ('INITIATIVE'),
    ('RESPONSIVENESS'),
    ('initiative_share'),
    ('reply_rate'),
    ('viewer_share'),
    ('other_share'),
    ('direction'),
    ('BALANCED'),
    ('LOW_DATA'),
    ('confidence'),
    ('confidence_code'),
    ('sample_size'),
    ('relative'),
    ('metric'),
    ('relationshipOrb'),
    ('dimensions'),
    ('dashboard_payload'),
    ('THIRD_DIMENSION_PENDING'),
    ('RESPECT'),
    ('viewerReplyRate'),
    ('otherReplyRate'),
    ('initiative_reciprocity_ratio'),
    ('reply_reciprocity_ratio'),
    ('jsonb_build_object'),
    ('json_build_object'),
    ('jsonb_agg'),
    ('json_agg')
)
select
  k.keyword,
  v.schema_name,
  v.object_name,
  v.object_type,
  -- short context snippets (first match positions)
  strpos(lower(v.definition), lower(k.keyword)) as first_pos,
  substring(
    v.definition
    from greatest(strpos(lower(v.definition), lower(k.keyword)) - 80, 1)
    for 240
  ) as context_snippet
from keywords k
join view_defs v
  on position(lower(k.keyword) in lower(v.definition)) > 0
order by k.keyword, v.object_name;

-- ---------------------------------------------------------------------------
-- 4) KEYWORD SEARCH inside function sources / definitions
-- ---------------------------------------------------------------------------
with fn_defs as (
  select
    n.nspname as schema_name,
    p.proname as object_name,
    'function'::text as object_type,
    pg_get_function_identity_arguments(p.oid) as arguments,
    coalesce(p.prosrc, '') || E'\n' || coalesce(pg_get_functiondef(p.oid), '') as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'analytics'
),
keywords(keyword) as (
  values
    ('INITIATIVE'),
    ('RESPONSIVENESS'),
    ('initiative_share'),
    ('reply_rate'),
    ('viewer_share'),
    ('other_share'),
    ('direction'),
    ('BALANCED'),
    ('LOW_DATA'),
    ('confidence'),
    ('confidence_code'),
    ('sample_size'),
    ('relative'),
    ('metric'),
    ('relationshipOrb'),
    ('dimensions'),
    ('dashboard_payload'),
    ('THIRD_DIMENSION_PENDING'),
    ('RESPECT'),
    ('viewerReplyRate'),
    ('otherReplyRate'),
    ('initiative_reciprocity_ratio'),
    ('reply_reciprocity_ratio'),
    ('jsonb_build_object'),
    ('json_build_object'),
    ('jsonb_agg'),
    ('json_agg')
)
select
  k.keyword,
  f.schema_name,
  f.object_name,
  f.arguments,
  f.object_type,
  strpos(lower(f.definition), lower(k.keyword)) as first_pos,
  substring(
    f.definition
    from greatest(strpos(lower(f.definition), lower(k.keyword)) - 80, 1)
    for 240
  ) as context_snippet
from keywords k
join fn_defs f
  on position(lower(k.keyword) in lower(f.definition)) > 0
order by k.keyword, f.object_name, f.arguments;

-- ---------------------------------------------------------------------------
-- 5) DEPENDENCIES — dashboard views → what they use (one hop + recursive)
-- ---------------------------------------------------------------------------
-- 5a) Direct dependencies of each existing dashboard view
with dashboard_views as (
  select c.oid, n.nspname, c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'analytics'
    and c.relkind = 'v'
    and c.relname like 'v_relationship_dashboard_v%'
)
select
  dv.nspname as dashboard_schema,
  dv.relname as dashboard_view,
  dep_ns.nspname as depends_on_schema,
  dep_cls.relname as depends_on_name,
  case dep_cls.relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    when 'f' then 'foreign'
    else dep_cls.relkind::text
  end as depends_on_type
from dashboard_views dv
join pg_rewrite rw on rw.ev_class = dv.oid
join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
join pg_class dep_cls on dep_cls.oid = d.refobjid
join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
where dep_cls.oid <> dv.oid
order by dv.relname, depends_on_schema, depends_on_name;

-- 5b) Recursive dependency chain from v_relationship_dashboard_v7 (if present)
with recursive chain as (
  select
    c.oid as obj_oid,
    n.nspname as schema_name,
    c.relname as object_name,
    c.relkind as relkind,
    0 as depth,
    array[c.oid] as path
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'analytics'
    and c.relname = 'v_relationship_dashboard_v7'
    and c.relkind in ('v', 'm')

  union all

  select
    dep_cls.oid,
    dep_ns.nspname,
    dep_cls.relname,
    dep_cls.relkind,
    ch.depth + 1,
    ch.path || dep_cls.oid
  from chain ch
  join pg_rewrite rw on rw.ev_class = ch.obj_oid
  join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
  join pg_class dep_cls on dep_cls.oid = d.refobjid
  join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
  where dep_cls.relkind in ('v', 'm', 'r')
    and not dep_cls.oid = any (ch.path)
    and ch.depth < 20
)
select
  depth,
  schema_name,
  object_name,
  case relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    else relkind::text
  end as object_type
from chain
order by depth, schema_name, object_name;

-- Same recursive walk for v6 (if v7 missing / for comparison)
with recursive chain as (
  select
    c.oid as obj_oid,
    n.nspname as schema_name,
    c.relname as object_name,
    c.relkind as relkind,
    0 as depth,
    array[c.oid] as path
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'analytics'
    and c.relname = 'v_relationship_dashboard_v6'
    and c.relkind in ('v', 'm')

  union all

  select
    dep_cls.oid,
    dep_ns.nspname,
    dep_cls.relname,
    dep_cls.relkind,
    ch.depth + 1,
    ch.path || dep_cls.oid
  from chain ch
  join pg_rewrite rw on rw.ev_class = ch.obj_oid
  join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
  join pg_class dep_cls on dep_cls.oid = d.refobjid
  join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
  where dep_cls.relkind in ('v', 'm', 'r')
    and not dep_cls.oid = any (ch.path)
    and ch.depth < 20
)
select
  depth,
  schema_name,
  object_name,
  case relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    else relkind::text
  end as object_type
from chain
order by depth, schema_name, object_name;

-- Function → relation dependencies (functions that touch analytics/public classes)
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  rn.nspname as depends_on_schema,
  rc.relname as depends_on_name,
  case rc.relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    else rc.relkind::text
  end as depends_on_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_depend d on d.objid = p.oid
join pg_class rc on rc.oid = d.refobjid
join pg_namespace rn on rn.oid = rc.relnamespace
where n.nspname = 'analytics'
  and rn.nspname in ('analytics', 'public')
order by p.proname, rn.nspname, rc.relname;

-- ---------------------------------------------------------------------------
-- 6) JSON PAYLOAD builders — locate jsonb_build_object / json_agg sites
-- ---------------------------------------------------------------------------
-- Views whose definition builds JSON
select
  schemaname as schema_name,
  viewname as object_name,
  'view'::text as object_type,
  pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true) as definition
from pg_views
where schemaname = 'analytics'
  and (
    pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%jsonb_build_object%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%json_build_object%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%jsonb_agg%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%json_agg%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%relationshipScreen%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%relationshipOrb%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%dimensions%'
    or pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true)
      ilike '%dashboard_payload%'
  )
order by viewname;

-- Functions whose body builds JSON / dashboard payload
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'analytics'
  and (
    coalesce(p.prosrc, '') ilike '%jsonb_build_object%'
    or coalesce(p.prosrc, '') ilike '%json_build_object%'
    or coalesce(p.prosrc, '') ilike '%jsonb_agg%'
    or coalesce(p.prosrc, '') ilike '%json_agg%'
    or coalesce(p.prosrc, '') ilike '%relationshipScreen%'
    or coalesce(p.prosrc, '') ilike '%relationshipOrb%'
    or coalesce(p.prosrc, '') ilike '%dimensions%'
    or coalesce(p.prosrc, '') ilike '%dashboard_payload%'
    or coalesce(pg_get_functiondef(p.oid), '') ilike '%jsonb_build_object%'
    or coalesce(pg_get_functiondef(p.oid), '') ilike '%relationshipScreen%'
  )
order by p.proname, arguments;

-- ---------------------------------------------------------------------------
-- 7) Column inventory for metric / pair / dashboard objects (for later SELECTs)
-- ---------------------------------------------------------------------------
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and (
    c.table_name like 'v_relationship%'
    or c.table_name like 'v_pair%'
  )
order by c.table_name, c.ordinal_position;

-- =============================================================================
-- END — paste ALL result grids back for architecture analysis.
-- Still no CREATE / ALTER / DROP / deploy.
-- =============================================================================
