-- =============================================================================
-- INTROSPECTION_08_targeted_keywords.sql
-- purpose: keyword hits in a narrow name set — NO full definitions returned
-- expected output: schema, object, type, keyword, match_position (≤200 rows)
-- run order: 6
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

with objects as (
  -- views matching name patterns
  select
    n.nspname as schema_name,
    c.relname as object_name,
    'view'::text as object_type,
    c.oid as obj_oid,
    null::oid as proc_oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'analytics'
    and c.relkind = 'v'
    and (
      c.relname like 'v_relationship_dashboard_%'
      or c.relname like 'v_relationship_metrics_%'
      or c.relname like 'v_relationship_metric_values_%'
      or c.relname like 'v_relationship_profile_%'
      or c.relname like 'v_relationship_position_%'
    )

  union all

  -- functions matching get_relationship_dashboard_%
  select
    n.nspname,
    p.proname,
    'function'::text,
    null::oid,
    p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'analytics'
    and p.proname like 'get_relationship_dashboard_%'
),
defs as (
  select
    o.schema_name,
    o.object_name,
    o.object_type,
    case
      when o.object_type = 'view' then pg_get_viewdef(o.obj_oid, true)
      else coalesce(p.prosrc, '')
    end as definition
  from objects o
  left join pg_proc p on p.oid = o.proc_oid
),
keywords(keyword) as (
  values
    ('BALANCED'),
    ('LOW_DATA'),
    ('VIEWER'),
    ('OTHER'),
    ('direction'),
    ('viewerShare'),
    ('otherShare'),
    ('viewer_share'),
    ('other_share'),
    ('confidence_code'),
    ('sample_size'),
    ('relationshipOrb'),
    ('dimensions'),
    ('THIRD_DIMENSION_PENDING'),
    ('INITIATIVE'),
    ('RESPONSIVENESS')
)
select
  d.schema_name,
  d.object_name,
  d.object_type,
  k.keyword,
  strpos(lower(d.definition), lower(k.keyword)) as match_position
from defs d
cross join keywords k
where strpos(lower(d.definition), lower(k.keyword)) > 0
order by d.object_name, k.keyword
limit 200;
