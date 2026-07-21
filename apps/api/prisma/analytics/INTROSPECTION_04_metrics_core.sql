-- =============================================================================
-- INTROSPECTION_04_metrics_core.sql
-- purpose: metrics / metric_values / directional_facts defs + targeted keywords
-- expected output: status, columns, one definition per object, keyword hits
-- run order: 3
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- A) Existence
select object_name,
  case when to_regclass(format('analytics.%I', object_name)) is null
    then 'MISSING' else 'EXISTS' end as status
from (values
  ('v_relationship_metrics_v0'),
  ('v_relationship_metric_values_v1'),
  ('v_relationship_directional_facts_v0')
) as t(object_name);

-- B) Columns (three objects only)
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
    'v_relationship_metrics_v0',
    'v_relationship_metric_values_v1',
    'v_relationship_directional_facts_v0'
  )
order by c.table_name, c.ordinal_position
limit 100;

-- C) Definitions — separate SELECTs (no string_agg)
select
  'v_relationship_metrics_v0'::text as object_name,
  case when to_regclass('analytics.v_relationship_metrics_v0') is null then null
       else pg_get_viewdef('analytics.v_relationship_metrics_v0'::regclass, true)
  end as view_definition;

select
  'v_relationship_metric_values_v1'::text as object_name,
  case when to_regclass('analytics.v_relationship_metric_values_v1') is null then null
       else pg_get_viewdef('analytics.v_relationship_metric_values_v1'::regclass, true)
  end as view_definition;

select
  'v_relationship_directional_facts_v0'::text as object_name,
  case when to_regclass('analytics.v_relationship_directional_facts_v0') is null then null
       else pg_get_viewdef('analytics.v_relationship_directional_facts_v0'::regclass, true)
  end as view_definition;

-- D) Keyword matches ONLY inside these three definitions
with targets(object_name) as (
  values
    ('v_relationship_metrics_v0'),
    ('v_relationship_metric_values_v1'),
    ('v_relationship_directional_facts_v0')
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
    ('initiative_share'),
    ('viewer_reply_rate'),
    ('other_reply_rate'),
    ('reply_rate_delta'),
    ('initiative_reciprocity_ratio'),
    ('reply_reciprocity_ratio'),
    ('sample_size'),
    ('confidence'),
    ('direction'),
    ('BALANCED'),
    ('LOW_DATA')
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
