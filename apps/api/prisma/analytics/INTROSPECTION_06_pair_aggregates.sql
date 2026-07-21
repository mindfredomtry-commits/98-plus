-- =============================================================================
-- INTROSPECTION_06_pair_aggregates.sql
-- purpose: pair aggregate views — can RESPECT reuse existing analytics counts?
-- expected output: status, columns, defs, keyword/pattern hints (no recursive)
-- run order: 4
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- Existence
select object_name,
  case when to_regclass(format('analytics.%I', object_name)) is null
    then 'MISSING' else 'EXISTS' end as status
from (values
  ('v_pair_summary'),
  ('v_pair_reply_count'),
  ('v_pair_survived_count'),
  ('v_pair_overboard_count'),
  ('v_pair_both_no_count'),
  ('v_pair_split_count'),
  ('v_pair_timeout_count'),
  ('v_pair_agreement_count')
) as t(object_name);

-- Columns
select
  c.table_schema,
  c.table_name as object_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name in (
    'v_pair_summary',
    'v_pair_reply_count',
    'v_pair_survived_count',
    'v_pair_overboard_count',
    'v_pair_both_no_count',
    'v_pair_split_count',
    'v_pair_timeout_count',
    'v_pair_agreement_count'
  )
order by c.table_name, c.ordinal_position
limit 100;

-- Definitions — separate SELECT per object (no string_agg)
select 'v_pair_summary'::text as object_name,
  case when to_regclass('analytics.v_pair_summary') is null then null
       else pg_get_viewdef('analytics.v_pair_summary'::regclass, true) end as view_definition;

select 'v_pair_reply_count'::text as object_name,
  case when to_regclass('analytics.v_pair_reply_count') is null then null
       else pg_get_viewdef('analytics.v_pair_reply_count'::regclass, true) end as view_definition;

select 'v_pair_survived_count'::text as object_name,
  case when to_regclass('analytics.v_pair_survived_count') is null then null
       else pg_get_viewdef('analytics.v_pair_survived_count'::regclass, true) end as view_definition;

select 'v_pair_overboard_count'::text as object_name,
  case when to_regclass('analytics.v_pair_overboard_count') is null then null
       else pg_get_viewdef('analytics.v_pair_overboard_count'::regclass, true) end as view_definition;

select 'v_pair_both_no_count'::text as object_name,
  case when to_regclass('analytics.v_pair_both_no_count') is null then null
       else pg_get_viewdef('analytics.v_pair_both_no_count'::regclass, true) end as view_definition;

select 'v_pair_split_count'::text as object_name,
  case when to_regclass('analytics.v_pair_split_count') is null then null
       else pg_get_viewdef('analytics.v_pair_split_count'::regclass, true) end as view_definition;

select 'v_pair_timeout_count'::text as object_name,
  case when to_regclass('analytics.v_pair_timeout_count') is null then null
       else pg_get_viewdef('analytics.v_pair_timeout_count'::regclass, true) end as view_definition;

select 'v_pair_agreement_count'::text as object_name,
  case when to_regclass('analytics.v_pair_agreement_count') is null then null
       else pg_get_viewdef('analytics.v_pair_agreement_count'::regclass, true) end as view_definition;

-- Pattern hints for RESPECT reuse (found flags only — no full text dump)
with targets(object_name) as (
  values
    ('v_pair_summary'),
    ('v_pair_reply_count'),
    ('v_pair_survived_count'),
    ('v_pair_overboard_count'),
    ('v_pair_both_no_count'),
    ('v_pair_split_count'),
    ('v_pair_timeout_count'),
    ('v_pair_agreement_count')
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
    ('Ban'),
    ('"Ban"'),
    ('outcome'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD'),
    ('SPLIT'),
    ('TIMEOUT'),
    ('status'),
    ('senderId'),
    ('receiverId'),
    ('viewer'),
    ('other'),
    ('period'),
    ('createdAt'),
    ('completedAt'),
    ('group by'),
    ('GROUP BY')
)
select
  d.object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from defs d
cross join keywords k
where position(lower(k.keyword) in lower(d.definition)) > 0
order by d.object_name, k.keyword
limit 200;

-- Direct source relations for each pair view (1-hop deps)
select
  src.relname as source_object,
  'view'::text as source_type,
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
  and src.relkind = 'v'
  and src.relname in (
    'v_pair_summary',
    'v_pair_reply_count',
    'v_pair_survived_count',
    'v_pair_overboard_count',
    'v_pair_both_no_count',
    'v_pair_split_count',
    'v_pair_timeout_count',
    'v_pair_agreement_count'
  )
  and dep_cls.oid <> src.oid
order by src.relname, depends_on_schema, depends_on_object
limit 100;
