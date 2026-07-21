-- =============================================================================
-- INTROSPECTION_12_metric_values.sql
-- purpose: full structure of analytics.v_relationship_metric_values_v1
--          (INSERT POINT for metric_code = 'RESPECT')
-- expected output: EXISTS/MISSING, columns, view_definition, 1-hop deps,
--                  structural keyword flags, optional distinct metric_code
-- run order: after INTROSPECTION_10 (universal dims confirmed)
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================
-- Confirmed product pipeline (do not deviate):
--   events
--     → v_relationship_metric_values_v1   ← RESPECT metric_value enters HERE
--     → dimension_definition / dimension_rule / confidence_rule
--     → v_dimensions_universal_v1
--     → v_relationship_dashboard_v7
--     → relationshipScreen
-- =============================================================================

-- A) Existence
select
  'v_relationship_metric_values_v1'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_metric_values_v1') is null
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
  and c.table_name = 'v_relationship_metric_values_v1'
order by c.ordinal_position
limit 100;

-- C) Full view definition (single object)
select
  'v_relationship_metric_values_v1'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_metric_values_v1') is null
      then null
    else pg_get_viewdef(
      'analytics.v_relationship_metric_values_v1'::regclass,
      true
    )
  end as view_definition;

-- D) Direct dependencies (1-hop only — no recursive CTE)
select
  'analytics'::text as source_schema,
  'v_relationship_metric_values_v1'::text as source_object,
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
  and src.relname = 'v_relationship_metric_values_v1'
  and src.relkind = 'v'
  and dep_cls.oid <> src.oid
order by depends_on_schema, depends_on_object
limit 100;

-- E) Structural keyword flags inside THIS definition only
with def as (
  select
    case
      when to_regclass('analytics.v_relationship_metric_values_v1') is null
        then ''
      else pg_get_viewdef(
        'analytics.v_relationship_metric_values_v1'::regclass,
        true
      )
    end as definition
),
keywords(keyword) as (
  values
    ('UNION ALL'),
    ('UNION'),
    ('INITIATIVE'),
    ('RESPONSIVENESS'),
    ('RESPECT'),
    ('metric_code'),
    ('metric_value'),
    ('sample_size'),
    ('supporting_facts'),
    ('relationship_days'),
    ('first_interaction_at'),
    ('last_interaction_at'),
    ('viewer_user_id'),
    ('other_user_id'),
    ('jsonb_build_object'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD'),
    ('SPLIT'),
    ('TIMEOUT'),
    ('v_pair_'),
    ('initiative'),
    ('reply_rate'),
    ('survived')
)
select
  'v_relationship_metric_values_v1'::text as object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from keywords k
cross join def d
order by k.keyword
limit 100;

-- F) Columns of 1-hop analytics view dependencies (no defs — keep light)
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
      and src.relname = 'v_relationship_metric_values_v1'
      and src.relkind = 'v'
      and dep_ns.nspname = 'analytics'
      and dep_cls.relkind in ('v', 'm')
      and dep_cls.oid <> src.oid
  )
order by c.table_name, c.ordinal_position
limit 100;

-- G) Optional: distinct metric_code values — ONLY after A=EXISTS
--    Left commented so MISSING view cannot abort the batch.
/*
select metric_code, count(*)::bigint as n
from analytics.v_relationship_metric_values_v1
group by 1
order by 1
limit 50;

select
  metric_code,
  jsonb_typeof(supporting_facts) as facts_type,
  supporting_facts
from analytics.v_relationship_metric_values_v1
where supporting_facts is not null
limit 20;
*/

-- H) Optional follow-up template: one dependency definition at a time
/*
select
  'REPLACE_DEP_NAME'::text as object_name,
  pg_get_viewdef('analytics.REPLACE_DEP_NAME'::regclass, true) as view_definition;
*/
