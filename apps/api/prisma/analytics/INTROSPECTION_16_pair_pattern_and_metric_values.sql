-- =============================================================================
-- INTROSPECTION_16_pair_pattern_and_metric_values.sql
-- purpose: production pair orientation pattern + full metric_values_v1 body
-- mode: READ-ONLY — SELECT only
-- =============================================================================
-- Needed to finalize APPLY_READY:
--   - repeat existing bidirectional pair generator (prefer directional_facts)
--   - copy initiative_share / responsiveness_share branches verbatim into
--     CREATE OR REPLACE VIEW analytics.v_relationship_metric_values_v1
-- =============================================================================

-- A) Existence
select object_name,
  case
    when to_regclass(format('analytics.%I', object_name)) is null
      then 'MISSING'
    else 'EXISTS'
  end as status
from (values
  ('v_relationship_directional_facts_v0'),
  ('v_relationship_metrics_v0'),
  ('v_relationship_metric_values_v1')
) as t(object_name);

-- B) Columns
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name in (
    'v_relationship_directional_facts_v0',
    'v_relationship_metrics_v0',
    'v_relationship_metric_values_v1'
  )
order by c.table_name, c.ordinal_position;

-- C) Full definitions (one object per statement — avoid disk pressure)
select
  'v_relationship_directional_facts_v0'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_directional_facts_v0') is null
      then null
    else pg_get_viewdef(
      'analytics.v_relationship_directional_facts_v0'::regclass,
      true
    )
  end as view_definition;

select
  'v_relationship_metrics_v0'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_metrics_v0') is null
      then null
    else pg_get_viewdef(
      'analytics.v_relationship_metrics_v0'::regclass,
      true
    )
  end as view_definition;

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

-- D) Keyword flags inside directional_facts (pair pattern clues)
with def as (
  select
    case
      when to_regclass('analytics.v_relationship_directional_facts_v0') is null
        then ''
      else pg_get_viewdef(
        'analytics.v_relationship_directional_facts_v0'::regclass,
        true
      )
    end as definition
),
keywords(keyword) as (
  values
    ('UNION ALL'),
    ('UNION'),
    ('viewer_user_id'),
    ('other_user_id'),
    ('senderId'),
    ('receiverId'),
    ('least'),
    ('greatest'),
    ('Ban'),
    ('BOTH_YES'),
    ('BOTH_NO'),
    ('OVERBOARD')
)
select
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found
from keywords k
cross join def d
order by k.keyword;

-- E) Keyword flags inside metric_values_v1
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
    ('initiative_share'),
    ('responsiveness_share'),
    ('respect_share'),
    ('supporting_facts'),
    ('round'),
    ('0.5000'),
    ('0.5'),
    ('WHERE')
)
select
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position
from keywords k
cross join def d
order by k.keyword;
