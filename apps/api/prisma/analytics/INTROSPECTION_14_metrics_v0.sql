-- =============================================================================
-- INTROSPECTION_14_metrics_v0.sql
-- purpose: full def + 1-hop deps of analytics.v_relationship_metrics_v0
--          (feeds initiative_share / responsiveness_share before metric_values)
-- expected output: EXISTS/MISSING, columns, view_definition, deps, keywords
-- run order: after INTROSPECTION_12 (metric_values = UNION of shares)
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================
-- Context: metric_values_v1 = initiative_share UNION ALL responsiveness_share
-- Prefer NOT extending metrics_v0 for RESPECT — use separate v_pair_respect_v1
-- then a third UNION branch in metric_values_v1.
-- =============================================================================

-- A) Existence
select
  'v_relationship_metrics_v0'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_metrics_v0') is null
      then 'MISSING'
    else 'EXISTS'
  end as status;

-- B) Columns
select
  c.table_schema,
  c.table_name as object_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name = 'v_relationship_metrics_v0'
order by c.ordinal_position
limit 100;

-- C) Definition
select
  'v_relationship_metrics_v0'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_metrics_v0') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_metrics_v0'::regclass, true)
  end as view_definition;

-- D) Direct dependencies (1-hop)
select
  'analytics'::text as source_schema,
  'v_relationship_metrics_v0'::text as source_object,
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
  and src.relname = 'v_relationship_metrics_v0'
  and src.relkind = 'v'
  and dep_cls.oid <> src.oid
order by depends_on_schema, depends_on_object
limit 100;

-- E) Keyword flags inside THIS definition only
with def as (
  select
    case
      when to_regclass('analytics.v_relationship_metrics_v0') is null
        then ''
      else pg_get_viewdef('analytics.v_relationship_metrics_v0'::regclass, true)
    end as definition
),
keywords(keyword) as (
  values
    ('UNION ALL'),
    ('initiative'),
    ('initiative_share'),
    ('responsiveness'),
    ('reply'),
    ('survived'),
    ('overboard'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD'),
    ('SPLIT'),
    ('TIMEOUT'),
    ('FAILED'),
    ('sample_size'),
    ('supporting_facts'),
    ('viewer_user_id'),
    ('other_user_id'),
    ('0.5000'),
    ('0.5'),
    ('v_pair_')
)
select
  'v_relationship_metrics_v0'::text as object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from keywords k
cross join def d
order by k.keyword
limit 100;

-- F) Columns of 1-hop analytics deps
select
  c.table_schema,
  c.table_name as object_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name in (
    select dep_cls.relname
    from pg_class src
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_rewrite rw on rw.ev_class = src.oid
    join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
    join pg_class dep_cls on dep_cls.oid = d.refobjid
    join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
    where src_ns.nspname = 'analytics'
      and src.relname = 'v_relationship_metrics_v0'
      and dep_ns.nspname = 'analytics'
      and dep_cls.relkind in ('v', 'm')
      and dep_cls.oid <> src.oid
  )
order by c.table_name, c.ordinal_position
limit 100;
