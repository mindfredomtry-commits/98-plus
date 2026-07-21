-- =============================================================================
-- INTROSPECTION_11_dashboard_v7_dimension_bundle.sql
-- purpose: confirm how dashboard_v7 builds dimension_bundle / FILTER blocks
-- expected output: keyword flags for FILTER/dimension_bundle; 1-hop deps again
-- run order: after INTROSPECTION_10 (optional companion)
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP
-- =============================================================================
-- Does NOT dump full v7 definition again if already captured in INTROSPECTION_01.
-- Only targeted structural flags + FILTER-related snippets.
-- =============================================================================

with def as (
  select
    case
      when to_regclass('analytics.v_relationship_dashboard_v7') is null
        then ''
      else pg_get_viewdef('analytics.v_relationship_dashboard_v7'::regclass, true)
    end as definition
),
keywords(keyword) as (
  values
    ('dimension_bundle'),
    ('dimension_rows'),
    ('v_dimensions_universal_v1'),
    ('FILTER'),
    ('INITIATIVE'),
    ('RESPONSIVENESS'),
    ('RESPECT'),
    ('THIRD_DIMENSION_PENDING'),
    ('viewerShare'),
    ('otherShare'),
    ('displayValue'),
    ('relationshipOrb'),
    ('dimensions'),
    ('jsonb_build_object'),
    ('jsonb_build_array'),
    ('jsonb_agg')
)
select
  'v_relationship_dashboard_v7'::text as object_name,
  k.keyword,
  (position(lower(k.keyword) in lower(d.definition)) > 0) as found,
  nullif(strpos(lower(d.definition), lower(k.keyword)), 0) as match_position,
  case
    when strpos(lower(d.definition), lower(k.keyword)) = 0 then null
    else substring(
      d.definition
      from greatest(strpos(lower(d.definition), lower(k.keyword)) - 60, 1)
      for 180
    )
  end as context_snippet
from keywords k
cross join def d
order by k.keyword
limit 100;

-- Count FILTER (WHERE dimension occurrences — approximate via keyword)
with def as (
  select
    case
      when to_regclass('analytics.v_relationship_dashboard_v7') is null
        then ''
      else pg_get_viewdef('analytics.v_relationship_dashboard_v7'::regclass, true)
    end as definition
)
select
  'v_relationship_dashboard_v7'::text as object_name,
  (
    length(lower(definition))
    - length(replace(lower(definition), 'filter (where', ''))
  ) / length('filter (where') as approx_filter_where_count
from def;
