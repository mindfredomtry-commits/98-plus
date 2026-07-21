-- =============================================================================
-- INTROSPECTION_17_pair_outcome_views.sql
-- purpose: can RESPECT be built from existing pair outcome views
--          (not from public."Ban" directly)?
-- targets:
--   analytics.v_pair_survived_count   → candidate for completed (BOTH_YES)
--   analytics.v_pair_both_no_count    → candidate for failed (BOTH_NO)
--   analytics.v_pair_overboard_count  → candidate for overboard
-- mode: READ-ONLY — SELECT only
-- =============================================================================
-- No CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
-- No APPLY. Paste all result grids back before rewriting APPLY_READY §1.
-- =============================================================================

-- #############################################################################
-- 0) Existence
-- #############################################################################
select object_name,
  case
    when to_regclass(format('analytics.%I', object_name)) is null
      then 'MISSING'
    else 'EXISTS'
  end as status
from (values
  ('v_pair_survived_count'),
  ('v_pair_both_no_count'),
  ('v_pair_overboard_count'),
  ('v_pair_split_count'),
  ('v_pair_timeout_count')
) as t(object_name);

-- #############################################################################
-- 1) COLUMNS — one grid for the three RESPECT sources (+ split/timeout ref)
-- #############################################################################
select
  c.table_schema,
  c.table_name as object_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name in (
    'v_pair_survived_count',
    'v_pair_both_no_count',
    'v_pair_overboard_count',
    'v_pair_split_count',
    'v_pair_timeout_count'
  )
order by c.table_name, c.ordinal_position;

-- Column-name alignment across the three RESPECT sources
select
  coalesce(s.column_name, b.column_name, o.column_name) as column_name,
  (s.column_name is not null) as in_survived,
  (b.column_name is not null) as in_both_no,
  (o.column_name is not null) as in_overboard
from (
  select column_name
  from information_schema.columns
  where table_schema = 'analytics' and table_name = 'v_pair_survived_count'
) s
full outer join (
  select column_name
  from information_schema.columns
  where table_schema = 'analytics' and table_name = 'v_pair_both_no_count'
) b using (column_name)
full outer join (
  select column_name
  from information_schema.columns
  where table_schema = 'analytics' and table_name = 'v_pair_overboard_count'
) o using (column_name)
order by column_name;

-- #############################################################################
-- 2) pg_get_viewdef — one statement per object
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

-- #############################################################################
-- 3) DEPENDENCIES — 1-hop only (no recursive CTE)
-- #############################################################################
select
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
where src_ns.nspname = 'analytics'
  and src.relname in (
    'v_pair_survived_count',
    'v_pair_both_no_count',
    'v_pair_overboard_count'
  )
  and src.relkind = 'v'
  and dep_cls.oid <> src.oid
order by source_object, depends_on_schema, depends_on_object;

-- #############################################################################
-- 4) PAIR CONTRACT — SELECT * samples (no assumed column names)
-- #############################################################################
select 'v_pair_survived_count'::text as object_name, t.*
from analytics.v_pair_survived_count t
limit 20;

select 'v_pair_both_no_count'::text as object_name, t.*
from analytics.v_pair_both_no_count t
limit 20;

select 'v_pair_overboard_count'::text as object_name, t.*
from analytics.v_pair_overboard_count t
limit 20;

-- #############################################################################
-- 5) JOIN KEYS / orientation keywords inside each definition
-- #############################################################################
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
    ('viewer_user_id'),
    ('other_user_id'),
    ('user_a_id'),
    ('user_b_id'),
    ('senderId'),
    ('receiverId'),
    ('initiator'),
    ('reactor'),
    ('viewer'),
    ('other'),
    ('UNION ALL'),
    ('UNION'),
    ('least'),
    ('greatest'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD'),
    ('survived'),
    ('count'),
    ('Ban'),
    ('createdAt'),
    ('completedAt'),
    ('first_'),
    ('last_')
)
select
  d.object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from defs d
cross join keywords k
order by d.object_name, k.keyword;

-- #############################################################################
-- 6) OPTIONAL — after columns known, refine join-key distincts
-- #############################################################################
-- Uncomment and replace REPLACE_* with real column names from §1 / §4.
/*
select
  'v_pair_survived_count'::text as object_name,
  count(*)::bigint as n_rows,
  count(distinct (REPLACE_VIEWER_COL, REPLACE_OTHER_COL))::bigint as n_directed_pairs
from analytics.v_pair_survived_count;

select
  'v_pair_both_no_count'::text as object_name,
  count(*)::bigint as n_rows,
  count(distinct (REPLACE_VIEWER_COL, REPLACE_OTHER_COL))::bigint as n_directed_pairs
from analytics.v_pair_both_no_count;

select
  'v_pair_overboard_count'::text as object_name,
  count(*)::bigint as n_rows,
  count(distinct (REPLACE_VIEWER_COL, REPLACE_OTHER_COL))::bigint as n_directed_pairs
from analytics.v_pair_overboard_count;
*/
