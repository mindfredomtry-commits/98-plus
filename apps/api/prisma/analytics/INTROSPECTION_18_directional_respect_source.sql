-- =============================================================================
-- INTROSPECTION_18_directional_respect_source.sql
-- purpose:
--   1) full defs of undirected pair outcome views (both_no / overboard)
--   2) locate lowest directional source for RESPECT
--      (sender + receiver + outcome + timestamps)
-- mode: READ-ONLY — SELECT only
-- =============================================================================
-- Context from INTROSPECTION_17:
--   v_pair_survived_count = undirected pair_id / user_a_id / user_b_id /
--                           survived_count over metric_value + metric_type
--   → CANNOT feed viewerRespectScore / otherRespectScore / respect_share
--
-- Do NOT rewrite APPLY_READY onto undirected pair joins.
-- Do NOT invent a/b split of shared counts.
-- Paste all grids before choosing final RESPECT source.
-- =============================================================================

-- #############################################################################
-- TASK 1 — full pg_get_viewdef: both_no + overboard (+ survived ref)
-- #############################################################################

select
  'v_pair_survived_count'::text as object_name,
  case
    when to_regclass('analytics.v_pair_survived_count') is null then null
    else pg_get_viewdef('analytics.v_pair_survived_count'::regclass, true)
  end as view_definition;

select
  'v_pair_both_no_count'::text as object_name,
  case
    when to_regclass('analytics.v_pair_both_no_count') is null then null
    else pg_get_viewdef('analytics.v_pair_both_no_count'::regclass, true)
  end as view_definition;

select
  'v_pair_overboard_count'::text as object_name,
  case
    when to_regclass('analytics.v_pair_overboard_count') is null then null
    else pg_get_viewdef('analytics.v_pair_overboard_count'::regclass, true)
  end as view_definition;

-- Same undirected metric_value pattern? (keyword flags only)
with targets(object_name) as (
  values
    ('v_pair_survived_count'),
    ('v_pair_both_no_count'),
    ('v_pair_overboard_count')
),
defs as (
  select
    t.object_name,
    case
      when to_regclass(format('analytics.%I', t.object_name)) is null then ''
      else pg_get_viewdef(format('analytics.%I', t.object_name)::regclass, true)
    end as definition
  from targets t
),
keywords(keyword) as (
  values
    ('metric_value'),
    ('metric_type'),
    ('numeric_value'),
    ('dimension_values'),
    ('user_a_id'),
    ('user_b_id'),
    ('pair_id'),
    ('senderId'),
    ('receiverId'),
    ('sender_id'),
    ('receiver_id'),
    ('viewer_user_id'),
    ('other_user_id'),
    ('Ban'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD')
)
select
  d.object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found
from defs d
cross join keywords k
order by d.object_name, k.keyword;

-- Columns alignment (both_no / overboard / survived)
select
  c.table_name as object_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name in (
    'v_pair_survived_count',
    'v_pair_both_no_count',
    'v_pair_overboard_count'
  )
order by c.table_name, c.ordinal_position;

-- #############################################################################
-- TASK 3 — candidate directional sources (existence hunt)
-- #############################################################################

select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'matview'
    else c.relkind::text
  end as object_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'analytics')
  and c.relkind in ('r', 'v', 'm')
  and (
    c.relname in (
      'analytics_ban_facts',
      'v_relationship_directional_facts_v0',
      'Ban'
    )
    or c.relname ilike '%ban_fact%'
    or c.relname ilike '%directional%'
    or c.relname ilike '%ban%fact%'
    or c.relname ilike '%interaction%fact%'
  )
order by schema_name, object_type, object_name;

-- Expected-object existence checklist
select object_ref,
  case
    when to_regclass(object_ref) is null then 'MISSING'
    else 'EXISTS'
  end as status
from (values
  ('public.analytics_ban_facts'),
  ('analytics.analytics_ban_facts'),
  ('analytics.v_relationship_directional_facts_v0'),
  ('public."Ban"')
) as t(object_ref);

-- #############################################################################
-- TASK 4 — public.analytics_ban_facts (primary candidate)
-- #############################################################################

-- 4a) columns
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.ordinal_position
from information_schema.columns c
where (
    (c.table_schema = 'public' and c.table_name = 'analytics_ban_facts')
    or (c.table_schema = 'analytics' and c.table_name = 'analytics_ban_facts')
  )
order by c.table_schema, c.ordinal_position;

-- 4b) direction / outcome / timestamp existence checklist
select
  expected.table_schema,
  expected.table_name,
  expected.column_name as expected_column,
  (c.column_name is not null) as exists_in_production
from (
  values
    ('public', 'analytics_ban_facts', 'sender_id'),
    ('public', 'analytics_ban_facts', 'senderId'),
    ('public', 'analytics_ban_facts', 'receiver_id'),
    ('public', 'analytics_ban_facts', 'receiverId'),
    ('public', 'analytics_ban_facts', 'outcome'),
    ('public', 'analytics_ban_facts', 'status'),
    ('public', 'analytics_ban_facts', 'created_at'),
    ('public', 'analytics_ban_facts', 'createdAt'),
    ('public', 'analytics_ban_facts', 'completed_at'),
    ('public', 'analytics_ban_facts', 'completedAt'),
    ('public', 'analytics_ban_facts', 'handled_at'),
    ('public', 'analytics_ban_facts', 'handledAt'),
    ('analytics', 'analytics_ban_facts', 'sender_id'),
    ('analytics', 'analytics_ban_facts', 'senderId'),
    ('analytics', 'analytics_ban_facts', 'receiver_id'),
    ('analytics', 'analytics_ban_facts', 'receiverId'),
    ('analytics', 'analytics_ban_facts', 'outcome'),
    ('analytics', 'analytics_ban_facts', 'created_at'),
    ('analytics', 'analytics_ban_facts', 'completed_at'),
    ('analytics', 'analytics_ban_facts', 'handled_at')
) as expected(table_schema, table_name, column_name)
left join information_schema.columns c
  on c.table_schema = expected.table_schema
 and c.table_name = expected.table_name
 and c.column_name = expected.column_name
order by expected.table_schema, expected.column_name;

-- 4c) pg_get_viewdef (null / note if table)
select
  'public.analytics_ban_facts'::text as object_name,
  case
    when to_regclass('public.analytics_ban_facts') is null then '[MISSING]'
    when (
      select c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'analytics_ban_facts'
      limit 1
    ) = 'v'
      then pg_get_viewdef('public.analytics_ban_facts'::regclass, true)
    else '[not a view — table/matview; use columns + SELECT *]'
  end as view_or_note;

select
  'analytics.analytics_ban_facts'::text as object_name,
  case
    when to_regclass('analytics.analytics_ban_facts') is null then '[MISSING]'
    when (
      select c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'analytics' and c.relname = 'analytics_ban_facts'
      limit 1
    ) = 'v'
      then pg_get_viewdef('analytics.analytics_ban_facts'::regclass, true)
    else '[not a view — table/matview; use columns + SELECT *]'
  end as view_or_note;

-- 4d) 1-hop dependencies (if view)
select
  src_ns.nspname as source_schema,
  src.relname as source_object,
  dep_ns.nspname as depends_on_schema,
  dep_cls.relname as depends_on_object,
  case dep_cls.relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    else dep_cls.relkind::text
  end as depends_on_type
from pg_class src
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_rewrite rw on rw.ev_class = src.oid
join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
join pg_class dep_cls on dep_cls.oid = d.refobjid
join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
where src.relkind = 'v'
  and (
    (src_ns.nspname = 'public' and src.relname = 'analytics_ban_facts')
    or (src_ns.nspname = 'analytics' and src.relname = 'analytics_ban_facts')
  )
  and dep_cls.oid <> src.oid
order by source_schema, depends_on_schema, depends_on_object;

-- 4e) SELECT * LIMIT 20 (skip statement if object MISSING)
select *
from public.analytics_ban_facts
limit 20;

-- If public missing but analytics exists, uncomment:
-- select * from analytics.analytics_ban_facts limit 20;

-- #############################################################################
-- TASK 3 continued — directional_facts_v0 (+ other directional)
-- #############################################################################

select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and (
    c.table_name = 'v_relationship_directional_facts_v0'
    or c.table_name ilike '%directional%'
  )
order by c.table_name, c.ordinal_position;

select
  'v_relationship_directional_facts_v0'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_directional_facts_v0') is null
      then null
    else pg_get_viewdef(
      'analytics.v_relationship_directional_facts_v0'::regclass,
      true
    )
  end as view_definition;

-- Keyword flags: does directional_facts keep sender/receiver/outcome?
with def as (
  select
    case
      when to_regclass('analytics.v_relationship_directional_facts_v0') is null
        then ''
      else pg_get_viewdef(
        'analytics.v_relationship_directional_facts_v0'::regclass,
        true
      )
    end as definition
),
keywords(keyword) as (
  values
    ('senderId'),
    ('receiverId'),
    ('sender_id'),
    ('receiver_id'),
    ('viewer_user_id'),
    ('other_user_id'),
    ('outcome'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD'),
    ('createdAt'),
    ('completedAt'),
    ('handledAt'),
    ('Ban'),
    ('analytics_ban_facts')
)
select
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found
from keywords k
cross join def d
order by k.keyword;

-- Fallback Ban column checklist (only if ban_facts / directional lack direction)
select
  expected.column_name as expected_column,
  (c.column_name is not null) as exists_in_production
from (
  values
    ('senderId'),
    ('receiverId'),
    ('outcome'),
    ('status'),
    ('createdAt'),
    ('completedAt'),
    ('handledAt')
) as expected(column_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'Ban'
 and c.column_name = expected.column_name
order by expected.column_name;
