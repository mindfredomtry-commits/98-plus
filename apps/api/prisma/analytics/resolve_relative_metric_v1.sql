-- =============================================================================
-- analytics.resolve_relative_metric_v1
-- version: 1
-- =============================================================================
-- Purpose: convert two linear scores into relative ORB shares.
-- Pure math — no table access. Safe for CROSS JOIN LATERAL.
--
-- Apply: manual in Supabase SQL Editor (staging first).
-- Does NOT change INITIATIVE / RESPONSIVENESS production objects.
-- =============================================================================

create schema if not exists analytics;

create or replace function analytics.resolve_relative_metric_v1(
  p_viewer_score numeric,
  p_other_score numeric
)
returns table (
  available boolean,
  viewer_share numeric,
  other_share numeric,
  reason_code text
)
language sql
immutable
parallel safe
as $$
  select
    case
      when p_viewer_score is null or p_other_score is null then false
      when p_viewer_score < 0 or p_other_score < 0 then false
      when (p_viewer_score + p_other_score) <= 0 then false
      else true
    end as available,
    case
      when p_viewer_score is null or p_other_score is null then null
      when p_viewer_score < 0 or p_other_score < 0 then null
      when (p_viewer_score + p_other_score) <= 0 then null
      else p_viewer_score / nullif(p_viewer_score + p_other_score, 0)
    end as viewer_share,
    case
      when p_viewer_score is null or p_other_score is null then null
      when p_viewer_score < 0 or p_other_score < 0 then null
      when (p_viewer_score + p_other_score) <= 0 then null
      else p_other_score / nullif(p_viewer_score + p_other_score, 0)
    end as other_share,
    case
      when p_viewer_score is null or p_other_score is null
        then 'MISSING_DIRECTION_DATA'
      when p_viewer_score < 0 or p_other_score < 0
        then 'INVALID_NEGATIVE_SCORE'
      when (p_viewer_score + p_other_score) <= 0
        then 'ZERO_TOTAL_SCORE'
      else 'AVAILABLE'
    end as reason_code;
$$;

comment on function analytics.resolve_relative_metric_v1(numeric, numeric) is
  'v1 relative ORB shares from two linear scores. Null≠0. Zero total → unavailable (not 50/50).';

-- ---------------------------------------------------------------------------
-- Smoke checks (read-only; does not mutate data)
-- ---------------------------------------------------------------------------
-- select * from analytics.resolve_relative_metric_v1(0.78, 0.54);
-- select * from analytics.resolve_relative_metric_v1(0, 0);
-- select * from analytics.resolve_relative_metric_v1(null, 0.5);
-- select * from analytics.resolve_relative_metric_v1(0, 0.8);
-- select * from analytics.resolve_relative_metric_v1(-0.1, 0.8);
