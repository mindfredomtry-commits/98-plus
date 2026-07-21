-- =============================================================================
-- INTROSPECTION_02_dashboard_v6.sql
-- purpose: definition + columns + 1-hop deps for v_relationship_dashboard_v6
-- expected output: EXISTS/MISSING, columns, view_definition, deps, keywords
-- run order: 2
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- A) Existence
select
  'v_relationship_dashboard_v6'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v6') is null
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
  and c.table_name = 'v_relationship_dashboard_v6'
order by c.ordinal_position
limit 100;

-- C) Definition
select
  'v_relationship_dashboard_v6'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v6') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_dashboard_v6'::regclass, true)
  end as view_definition;

-- D) Direct dependencies (one hop)
select
  'analytics'::text as source_schema,
  'v_relationship_dashboard_v6'::text as source_object,
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
  and src.relname = 'v_relationship_dashboard_v6'
  and src.relkind = 'v'
  and dep_cls.oid <> src.oid
order by depends_on_schema, depends_on_object
limit 100;

-- E) Keyword check inside THIS definition only
with def as (
  select
    case
      when to_regclass('analytics.v_relationship_dashboard_v6') is null
        then ''
      else pg_get_viewdef('analytics.v_relationship_dashboard_v6'::regclass, true)
    end as definition
),
keywords(keyword) as (
  values
    ('relationshipScreen'),
    ('relationshipOrb'),
    ('dimensions'),
    ('INITIATIVE'),
    ('RESPONSIVENESS'),
    ('THIRD_DIMENSION_PENDING'),
    ('dashboard_payload'),
    ('jsonb_build_object'),
    ('jsonb_set')
)
select
  'v_relationship_dashboard_v6'::text as object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from keywords k
cross join def d
order by k.keyword
limit 100;
