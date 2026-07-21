-- =============================================================================
-- INTROSPECTION_10_dimensions_universal.sql
-- purpose: full definition + deps + structure of v_dimensions_universal_v1
-- expected output: EXISTS/MISSING, columns, view_definition, 1-hop deps,
--                  UNION/dimension_code/keyword flags (no recursive CTE)
-- run order: after INTROSPECTION_01_dashboard_v7 (confirmed architecture step)
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================
-- Context (confirmed from live dashboard_v7 analysis — do not re-invent):
--   v_dimensions_universal_v1
--     → dimension_bundle (CTE inside dashboard_v7)
--     → analytics.v_relationship_dashboard_v7
--     → relationshipScreen JSON
-- RESPECT must enter as a universal dimension row, not a dashboard special-case.
-- =============================================================================

-- A) Existence
select
  'v_dimensions_universal_v1'::text as object_name,
  case
    when to_regclass('analytics.v_dimensions_universal_v1') is null
      then 'MISSING'
    else 'EXISTS'
  end as status;

-- B) Columns (contract surface)
select
  c.table_schema,
  c.table_name as object_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name = 'v_dimensions_universal_v1'
order by c.ordinal_position
limit 100;

-- C) Full CREATE VIEW text (single object — keep light)
select
  'v_dimensions_universal_v1'::text as object_name,
  case
    when to_regclass('analytics.v_dimensions_universal_v1') is null
      then null
    else pg_get_viewdef('analytics.v_dimensions_universal_v1'::regclass, true)
  end as view_definition;

-- D) Direct dependencies (1-hop only)
select
  'analytics'::text as source_schema,
  'v_dimensions_universal_v1'::text as source_object,
  'view'::text as source_type,
  dep_ns.nspname as depends_on_schema,
  dep_cls.relname as depends_on_object,
  case dep_cls.relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    when 'f' then 'foreign'
    else dep_cls.relkind::text
  end as depends_on_type
from pg_class src
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_rewrite rw on rw.ev_class = src.oid
join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
join pg_class dep_cls on dep_cls.oid = d.refobjid
join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
where src_ns.nspname = 'analytics'
  and src.relname = 'v_dimensions_universal_v1'
  and src.relkind = 'v'
  and dep_cls.oid <> src.oid
order by depends_on_schema, depends_on_object
limit 100;

-- E) Structural keyword flags inside THIS definition only
with def as (
  select
    case
      when to_regclass('analytics.v_dimensions_universal_v1') is null
        then ''
      else pg_get_viewdef('analytics.v_dimensions_universal_v1'::regclass, true)
    end as definition
),
keywords(keyword) as (
  values
    ('UNION ALL'),
    ('UNION'),
    ('INITIATIVE'),
    ('RESPONSIVENESS'),
    ('RESPECT'),
    ('THIRD_DIMENSION_PENDING'),
    ('dimension_code'),
    ('dimension_name'),
    ('score'),
    ('result_code'),
    ('result_name'),
    ('description'),
    ('confidence_code'),
    ('confidence_score'),
    ('sample_size'),
    ('is_publishable'),
    ('publishable'),
    ('LOW_DATA'),
    ('BALANCED'),
    ('VIEWER'),
    ('OTHER'),
    ('0.55'),
    ('0.45'),
    ('viewer_share'),
    ('other_share'),
    ('viewerShare'),
    ('otherShare')
)
select
  'v_dimensions_universal_v1'::text as object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from keywords k
cross join def d
order by k.keyword
limit 100;

-- F) If 1-hop deps are other views: list their columns (narrow — no defs yet)
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
      and src.relname = 'v_dimensions_universal_v1'
      and src.relkind = 'v'
      and dep_ns.nspname = 'analytics'
      and dep_cls.relkind in ('v', 'm')
      and dep_cls.oid <> src.oid
  )
order by c.table_name, c.ordinal_position
limit 100;

-- G) Optional follow-up: definitions of EACH 1-hop analytics view dependency
--    Run one at a time if temp disk is tight. Template (commented):
/*
select
  dep_cls.relname as object_name,
  pg_get_viewdef(dep_cls.oid, true) as view_definition
from pg_class src
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_rewrite rw on rw.ev_class = src.oid
join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
join pg_class dep_cls on dep_cls.oid = d.refobjid
join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
where src_ns.nspname = 'analytics'
  and src.relname = 'v_dimensions_universal_v1'
  and dep_ns.nspname = 'analytics'
  and dep_cls.relkind = 'v'
  and dep_cls.relname = 'REPLACE_WITH_ONE_DEP_NAME'
limit 1;
*/

-- H/I) Live distinct / distribution queries — ONLY after A=EXISTS and B shows
--     real column names. Left commented so MISSING view cannot abort the batch.
/*
select distinct dimension_code
from analytics.v_dimensions_universal_v1
order by 1
limit 50;

select
  dimension_code,
  result_code,
  confidence_code,
  is_publishable,
  count(*)::bigint as n
from analytics.v_dimensions_universal_v1
group by 1, 2, 3, 4
order by 1, 5 desc
limit 100;
*/
