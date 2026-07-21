-- =============================================================================
-- analytics.v_pair_respect_v1
-- version: 1
-- status: PROD GATE on direction ⛔ (relative helper is ready)
-- =============================================================================
-- Pipeline:
--   Ban outcomes → linear respect scores
--     → analytics.resolve_relative_metric_v1
--     → analytics.resolve_relationship_direction_v1  (PROD GATE)
--
-- Outcomes (confirmed from app code):
--   completed  = BOTH_YES
--   failed     = BOTH_NO
--   overboard  = OVERBOARD
-- Excluded: SPLIT, TIMEOUT, BanStatus.FAILED, unfinished bans
--
-- Prerequisites (apply in order, staging first):
--   1) resolve_relative_metric_v1.sql
--   2) resolve_relationship_direction_v1.sql  (still gated)
--   3) this view
--
-- Do NOT wire public relationshipScreen RESPECT.direction while direction
-- helper returns DIRECTION_HELPER_UNCONFIRMED.
-- Do NOT modify INITIATIVE / RESPONSIVENESS production objects here.
-- =============================================================================

create schema if not exists analytics;

create or replace view analytics.v_pair_respect_v1 as
with pair_keys as (
  select distinct
    b."senderId"   as initiator_id,
    b."receiverId" as reactor_id
  from public."Ban" b
  where b.outcome in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD')
),
directed as (
  select
    pk.reactor_id   as viewer_user_id,
    pk.initiator_id as other_user_id,
    count(*) filter (where b.outcome = 'BOTH_YES')::int   as completed_count,
    count(*) filter (where b.outcome = 'BOTH_NO')::int    as failed_count,
    count(*) filter (where b.outcome = 'OVERBOARD')::int  as overboard_count
  from pair_keys pk
  left join public."Ban" b
    on b."senderId" = pk.initiator_id
   and b."receiverId" = pk.reactor_id
   and b.outcome in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD')
  group by pk.reactor_id, pk.initiator_id
),
pairs as (
  select distinct
    least(viewer_user_id, other_user_id)    as user_a_id,
    greatest(viewer_user_id, other_user_id) as user_b_id
  from directed
),
scored as (
  select
    p.user_a_id,
    p.user_b_id,
    coalesce(d_ab.completed_count, 0) as a_completed,
    coalesce(d_ab.failed_count, 0)    as a_failed,
    coalesce(d_ab.overboard_count, 0) as a_overboard,
    coalesce(d_ab.completed_count, 0)
      + coalesce(d_ab.failed_count, 0)
      + coalesce(d_ab.overboard_count, 0) as a_sample,
    coalesce(d_ba.completed_count, 0) as b_completed,
    coalesce(d_ba.failed_count, 0)    as b_failed,
    coalesce(d_ba.overboard_count, 0) as b_overboard,
    coalesce(d_ba.completed_count, 0)
      + coalesce(d_ba.failed_count, 0)
      + coalesce(d_ba.overboard_count, 0) as b_sample
  from pairs p
  left join directed d_ab
    on d_ab.viewer_user_id = p.user_a_id
   and d_ab.other_user_id = p.user_b_id
  left join directed d_ba
    on d_ba.viewer_user_id = p.user_b_id
   and d_ba.other_user_id = p.user_a_id
),
linear as (
  select
    s.*,
    case when s.a_sample > 0
      then s.a_completed::numeric / nullif(s.a_sample, 0)::numeric
      else null
    end as a_respect_score,
    case when s.b_sample > 0
      then s.b_completed::numeric / nullif(s.b_sample, 0)::numeric
      else null
    end as b_respect_score
  from scored s
),
oriented as (
  select
    l.user_a_id as viewer_user_id,
    l.user_b_id as other_user_id,
    l.a_completed as viewer_completed_count,
    l.a_failed    as viewer_failed_count,
    l.a_overboard as viewer_overboard_count,
    l.a_sample    as viewer_sample_size,
    l.a_respect_score as viewer_respect_score,
    l.b_completed as other_completed_count,
    l.b_failed    as other_failed_count,
    l.b_overboard as other_overboard_count,
    l.b_sample    as other_sample_size,
    l.b_respect_score as other_respect_score
  from linear l
  union all
  select
    l.user_b_id,
    l.user_a_id,
    l.b_completed,
    l.b_failed,
    l.b_overboard,
    l.b_sample,
    l.b_respect_score,
    l.a_completed,
    l.a_failed,
    l.a_overboard,
    l.a_sample,
    l.a_respect_score
  from linear l
)
select
  o.viewer_user_id,
  o.other_user_id,
  o.viewer_completed_count,
  o.viewer_failed_count,
  o.viewer_overboard_count,
  o.viewer_sample_size,
  o.viewer_respect_score,
  o.other_completed_count,
  o.other_failed_count,
  o.other_overboard_count,
  o.other_sample_size,
  o.other_respect_score,
  rel.available,
  rel.viewer_share,
  rel.other_share,
  rel.reason_code as relative_reason_code,
  dir.direction,
  dir.confidence_code,
  dir.reason_code as direction_reason_code
from oriented o
cross join lateral analytics.resolve_relative_metric_v1(
  o.viewer_respect_score,
  o.other_respect_score
) as rel
cross join lateral analytics.resolve_relationship_direction_v1(
  rel.available,
  rel.viewer_share,
  rel.other_share,
  o.viewer_sample_size,
  o.other_sample_size
) as dir;

comment on view analytics.v_pair_respect_v1 is
  'RESPECT v1 via resolve_relative_metric_v1 + resolve_relationship_direction_v1 (direction PROD GATE).';

-- =============================================================================
-- Public dimension fragment (NO linear scores / counts / reason codes)
-- Wire into get_relationship_dashboard_v1 only after direction helper confirmed.
--
-- select jsonb_build_object(
--   'code', 'RESPECT',
--   'ring', 'INNER',
--   'title', 'Уважение',
--   'available', r.available,
--   'viewerShare', r.viewer_share,
--   'otherShare', r.other_share,
--   'displayValue', case
--       when r.available and r.viewer_share is not null
--         then round(r.viewer_share * 100)::text || '%'
--       else null
--     end,
--   'direction', r.direction,  -- must NOT be DIRECTION_HELPER_UNCONFIRMED in prod
--   'description', case
--       when r.direction = 'BALANCED' then
--         'Вы примерно одинаково относитесь к запретам друг друга.'
--       when r.direction = 'VIEWER' then
--         'Показатель уважения смещён в твою сторону.'
--       when r.direction = 'OTHER' then
--         'Показатель уважения смещён в сторону ' || peer_display_name || '.'
--       else null
--     end,
--   'sampleSize', case
--       when r.available then r.viewer_sample_size + r.other_sample_size
--       else null
--     end,
--   'viewerSampleSize', r.viewer_sample_size,
--   'otherSampleSize', r.other_sample_size
-- )
-- from analytics.v_pair_respect_v1 r
-- where r.viewer_user_id = p_viewer and r.other_user_id = p_other;
-- =============================================================================
