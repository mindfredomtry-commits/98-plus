-- =============================================================================
-- INTROSPECTION_09_dashboard_dependencies.sql
-- purpose: direct (1-hop) dependencies for dashboard v7 and v6 only
-- expected output: source_* / depends_on_* rows; recursive CTE commented out
-- run order: 7
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- A) Direct dependencies — v7
select
  'analytics'::text as source_schema,
  'v_relationship_dashboard_v7'::text as source_object,
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
  and src.relname = 'v_relationship_dashboard_v7'
  and src.relkind = 'v'
  and dep_cls.oid <> src.oid
order by depends_on_schema, depends_on_object
limit 100;

-- B) Direct dependencies — v6
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

-- =============================================================================
-- OPTIONAL: recursive dependency walk for v7 — COMMENTED OUT by default.
-- Uncomment ONLY if direct deps are insufficient and temp disk allows.
-- =============================================================================
/*
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
    and c.relkind = 'v'

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
    and ch.depth < 8
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
order by depth, schema_name, object_name
limit 100;
*/
