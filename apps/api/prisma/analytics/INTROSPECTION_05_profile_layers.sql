-- =============================================================================
-- INTROSPECTION_05_profile_layers.sql
-- purpose: profile / position / explanation / narrative definitions
-- expected output: status + view_definition; keyword presence for publish fields
-- run order: 9 (after core architecture)
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- Existence
select object_name,
  case when to_regclass(format('analytics.%I', object_name)) is null
    then 'MISSING' else 'EXISTS' end as status
from (values
  ('v_relationship_profile_v1'),
  ('v_relationship_position_v0'),
  ('v_relationship_explanation_facts_v0'),
  ('v_relationship_narrative_v1')
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
    'v_relationship_profile_v1',
    'v_relationship_position_v0',
    'v_relationship_explanation_facts_v0',
    'v_relationship_narrative_v1'
  )
order by c.table_name, c.ordinal_position
limit 100;

-- Definitions — one SELECT each
select
  'v_relationship_profile_v1'::text as object_name,
  case when to_regclass('analytics.v_relationship_profile_v1') is null then null
       else pg_get_viewdef('analytics.v_relationship_profile_v1'::regclass, true)
  end as view_definition;

select
  'v_relationship_position_v0'::text as object_name,
  case when to_regclass('analytics.v_relationship_position_v0') is null then null
       else pg_get_viewdef('analytics.v_relationship_position_v0'::regclass, true)
  end as view_definition;

select
  'v_relationship_explanation_facts_v0'::text as object_name,
  case when to_regclass('analytics.v_relationship_explanation_facts_v0') is null then null
       else pg_get_viewdef('analytics.v_relationship_explanation_facts_v0'::regclass, true)
  end as view_definition;

select
  'v_relationship_narrative_v1'::text as object_name,
  case when to_regclass('analytics.v_relationship_narrative_v1') is null then null
       else pg_get_viewdef('analytics.v_relationship_narrative_v1'::regclass, true)
  end as view_definition;

-- Field presence (no full-definition dump in this result)
with targets(object_name) as (
  values
    ('v_relationship_profile_v1'),
    ('v_relationship_position_v0'),
    ('v_relationship_explanation_facts_v0'),
    ('v_relationship_narrative_v1')
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
    ('position_code'),
    ('dimension_score'),
    ('raw_result_code'),
    ('published_result_code'),
    ('confidence_code'),
    ('confidence_score'),
    ('is_publishable')
)
select
  d.object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from defs d
cross join keywords k
order by d.object_name, k.keyword
limit 100;
