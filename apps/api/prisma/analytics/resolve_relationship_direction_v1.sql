-- =============================================================================
-- analytics.resolve_relationship_direction_v1
-- version: 1
-- status: PROD GATE ⛔
-- =============================================================================
-- Purpose: single direction resolver for Relationship ORB metrics.
--
-- DO NOT APPLY TO PRODUCTION until live INITIATIVE / RESPONSIVENESS logic is
-- extracted via INTROSPECTION_relationship_direction_v1.sql and this body is
-- replaced with that exact rule (threshold, LOW_DATA, confidence).
--
-- Current safe stub:
--   - NOT_AVAILABLE when unavailable / null shares
--   - VIEWER / OTHER / BALANCED / LOW_DATA intentionally NOT production-final
--   - no exact-equality BALANCED as a temporary production rule
--
-- Expected product codes (reuse existing — do not invent new ones silently):
--   VIEWER | OTHER | BALANCED | LOW_DATA | NOT_AVAILABLE
-- =============================================================================

create schema if not exists analytics;

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
      -- ⛔ PROD GATE: real VIEWER/OTHER/BALANCED/LOW_DATA rule goes here after
      -- introspection of INITIATIVE / RESPONSIVENESS. Until then only
      -- NOT_AVAILABLE is emitted for unavailable inputs; available inputs
      -- return a non-production placeholder that must not be wired to
      -- public relationshipScreen in production.
      else 'DIRECTION_HELPER_UNCONFIRMED'
    end as direction,
    case
      when coalesce(p_available, false) = false then 'NONE'
      when p_viewer_share is null or p_other_share is null then 'NONE'
      else 'UNCONFIRMED'
    end as confidence_code,
    case
      when coalesce(p_available, false) = false then 'UNAVAILABLE_INPUT'
      when p_viewer_share is null or p_other_share is null then 'NULL_SHARE'
      else 'PROD_GATE_AWAITING_INTROSPECTION'
    end as reason_code;
$$;

comment on function analytics.resolve_relationship_direction_v1(boolean, numeric, numeric, integer, integer) is
  'v1 ORB direction helper — PROD GATE until parity with INITIATIVE/RESPONSIVENESS. Stub returns NOT_AVAILABLE or DIRECTION_HELPER_UNCONFIRMED.';

-- After introspection, replace the available branch with the confirmed CASE, e.g.:
--   when abs(p_viewer_share - 0.5) <= <confirmed_threshold> then 'BALANCED'
--   when p_viewer_share > p_other_share then 'VIEWER'
--   else 'OTHER'
-- plus any LOW_DATA sample/confidence rule copied verbatim from production.
--
-- Never invent a new threshold for RESPECT alone.
--
-- Smoke:
-- select * from analytics.resolve_relationship_direction_v1(false, null, null, 0, 0);
-- select * from analytics.resolve_relationship_direction_v1(true, 0.59, 0.41, 100, 80);
