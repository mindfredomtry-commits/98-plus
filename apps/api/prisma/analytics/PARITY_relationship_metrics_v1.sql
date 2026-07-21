-- =============================================================================
-- PARITY_relationship_metrics_v1.sql
-- READ-ONLY parity harness — do NOT mutate production INITIATIVE/RESPONSIVENESS
-- version: 1
-- status: TEMPLATE — fill after introspection reveals real column/object names
-- =============================================================================
-- Goal: compare existing production metric outputs vs new helpers
--   analytics.resolve_relative_metric_v1
--   analytics.resolve_relationship_direction_v1  (only after PROD GATE lifted)
--
-- Requirements for safe migration (must all pass):
--   - availability 100% match
--   - viewerShare / otherShare within numeric precision
--   - direction 100% match
--   - low-data / null / confidence handling match
-- Until then: leave production INITIATIVE / RESPONSIVENESS untouched.
-- =============================================================================

-- Prerequisites:
--   1) Run INTROSPECTION_relationship_direction_v1.sql
--   2) Apply resolve_relative_metric_v1.sql (safe additive)
--   3) Confirm direction helper body matches production (lift PROD GATE)
--   4) Replace placeholders below with real view/column names from introspection

-- ---------------------------------------------------------------------------
-- PLACEHOLDER: existing metric rows
-- Replace analytics.<existing_metric_values> and column names after introspect.
-- ---------------------------------------------------------------------------
/*
with existing as (
  select
    viewer_user_id,
    other_user_id,
    metric_code,                 -- 'INITIATIVE' | 'RESPONSIVENESS'
    available        as existing_available,
    viewer_share     as existing_viewer_share,
    other_share      as existing_other_share,
    direction        as existing_direction,
    confidence_code  as existing_confidence,
    viewer_sample_size,
    other_sample_size,
    viewer_linear_score,         -- if exposed; else reconstruct
    other_linear_score
  from analytics.<existing_metric_values>
  where metric_code in ('INITIATIVE', 'RESPONSIVENESS')
),
recomputed as (
  select
    e.*,
    rel.available      as new_available,
    rel.viewer_share   as new_viewer_share,
    rel.other_share    as new_other_share,
    rel.reason_code    as relative_reason_code,
    dir.direction      as new_direction,
    dir.confidence_code as new_confidence,
    dir.reason_code    as direction_reason_code
  from existing e
  cross join lateral analytics.resolve_relative_metric_v1(
    e.viewer_linear_score,
    e.other_linear_score
  ) rel
  cross join lateral analytics.resolve_relationship_direction_v1(
    rel.available,
    rel.viewer_share,
    rel.other_share,
    e.viewer_sample_size,
    e.other_sample_size
  ) dir
)
select
  metric_code,
  count(*) as rows_total,
  count(*) filter (
    where existing_available is distinct from new_available
  ) as available_mismatches,
  count(*) filter (
    where existing_direction is distinct from new_direction
  ) as direction_mismatches,
  count(*) filter (
    where existing_confidence is distinct from new_confidence
  ) as confidence_mismatches,
  count(*) filter (
    where existing_available
      and (
        abs(coalesce(existing_viewer_share, -1) - coalesce(new_viewer_share, -1)) > 1e-9
        or abs(coalesce(existing_other_share, -1) - coalesce(new_other_share, -1)) > 1e-9
      )
  ) as share_mismatches
from recomputed
group by metric_code
order by metric_code;

-- Diff detail (must be empty before production cutover):
select *
from recomputed
where existing_available is distinct from new_available
   or existing_direction is distinct from new_direction
   or existing_confidence is distinct from new_confidence
   or (
        existing_available
        and (
          abs(coalesce(existing_viewer_share, -1) - coalesce(new_viewer_share, -1)) > 1e-9
          or abs(coalesce(existing_other_share, -1) - coalesce(new_other_share, -1)) > 1e-9
        )
      )
limit 200;
*/

-- ---------------------------------------------------------------------------
-- Helper-only smoke (safe anytime after relative helper applied)
-- ---------------------------------------------------------------------------
select 'relative_0.78_0.54' as case_id, *
from analytics.resolve_relative_metric_v1(0.78, 0.54);

select 'relative_0_0' as case_id, *
from analytics.resolve_relative_metric_v1(0, 0);

select 'relative_0_0.8' as case_id, *
from analytics.resolve_relative_metric_v1(0, 0.8);

select 'relative_null' as case_id, *
from analytics.resolve_relative_metric_v1(null, 0.5);

-- Direction smoke only after stub/confirmed helper exists:
-- select * from analytics.resolve_relationship_direction_v1(true, 0.5, 0.5, 10, 10);
-- select * from analytics.resolve_relationship_direction_v1(true, 0.5001, 0.4999, 10, 10);
-- select * from analytics.resolve_relationship_direction_v1(false, null, null, 0, 0);

-- =============================================================================
-- Decision rule:
-- IF any mismatch row exists → DO NOT migrate INITIATIVE/RESPONSIVENESS
-- IF zero mismatches across availability/shares/direction/confidence →
--    schedule a separate additive cutover PR (not this stage)
-- =============================================================================
