-- =============================================================================
-- analytics.relationship_metric_direction_v1
-- analytics.resolve_relationship_direction_v1
-- version: 1
-- Canonical ORB direction: 49–51% inclusive = BALANCED
-- =============================================================================
-- viewer_share is 0..1. Direction uses round(share * 100) to match display %.
-- Must stay in lockstep with packages/shared resolveRelationshipMetricDirection:
--
--   pct > 51  → VIEWER
--   pct < 49  → OTHER
--   else      → BALANCED  (49, 50, 51)
--   null share → LOW_DATA (orb JSON) / NOT_AVAILABLE (full resolver)
-- =============================================================================

create schema if not exists analytics;

-- Scalar twin of TypeScript resolveRelationshipMetricDirection().
-- Use this from overview / period / day / dashboard JSON builders.
create or replace function analytics.relationship_metric_direction_v1(
  p_viewer_share numeric
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_viewer_share is null then 'LOW_DATA'
    when round(p_viewer_share * 100) > 51 then 'VIEWER'
    when round(p_viewer_share * 100) < 49 then 'OTHER'
    else 'BALANCED'
  end;
$$;

comment on function analytics.relationship_metric_direction_v1(numeric) is
  'ORB direction from viewer_share: BALANCED when round(share*100) in 49..51 inclusive; null → LOW_DATA.';

create or replace function analytics.resolve_relationship_direction_v1(
  p_available boolean,
  p_viewer_share numeric,
  p_other_share numeric,
  p_viewer_sample_size integer,
  p_other_sample_size integer
)
returns table (
  direction text,
  confidence_code text,
  reason_code text
)
language sql
immutable
parallel safe
as $$
  select
    case
      when coalesce(p_available, false) = false then 'NOT_AVAILABLE'
      when p_viewer_share is null or p_other_share is null then 'NOT_AVAILABLE'
      else analytics.relationship_metric_direction_v1(p_viewer_share)
    end as direction,
    case
      when coalesce(p_available, false) = false then 'NONE'
      when p_viewer_share is null or p_other_share is null then 'NONE'
      when coalesce(p_viewer_sample_size, 0) + coalesce(p_other_sample_size, 0) >= 20
        then 'HIGH'
      when coalesce(p_viewer_sample_size, 0) + coalesce(p_other_sample_size, 0) >= 5
        then 'MEDIUM'
      when coalesce(p_viewer_sample_size, 0) + coalesce(p_other_sample_size, 0) > 0
        then 'LOW'
      else 'NO_DATA'
    end as confidence_code,
    case
      when coalesce(p_available, false) = false then 'UNAVAILABLE_INPUT'
      when p_viewer_share is null or p_other_share is null then 'NULL_SHARE'
      when round(p_viewer_share * 100) > 51 then 'VIEWER_LEAD'
      when round(p_viewer_share * 100) < 49 then 'OTHER_LEAD'
      else 'BALANCED_BAND'
    end as reason_code;
$$;

comment on function analytics.resolve_relationship_direction_v1(boolean, numeric, numeric, integer, integer) is
  'v1 direction resolver: uses relationship_metric_direction_v1 when shares available; else NOT_AVAILABLE.';
