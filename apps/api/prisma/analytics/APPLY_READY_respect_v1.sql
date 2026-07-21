-- =============================================================================
-- APPLY_READY_respect_v1.sql
-- status: DO NOT APPLY / DO NOT RUN IN PRODUCTION
-- version: 3
-- =============================================================================
-- Apply order (manual, later):
--   1) CREATE VIEW analytics.v_pair_respect_v1
--   2) CREATE OR REPLACE VIEW analytics.v_relationship_metric_values_v1
--      (existing two branches verbatim + respect_share)
--   3) Catalog INSERT (definition → rules → confidence)
--   4) dashboard_v7 — deferred
--
-- GATE before uncommenting §1 / §2:
--   1) INTROSPECTION_19 → choose source:
--        analytics_ban_facts (if directional) ELSE public."Ban"
--   2) INTROSPECTION_16 → paste metric_values body for UNION
--
-- REJECTED forever for directed RESPECT (INTROSPECTION_17 confirmed):
--   v_pair_survived_count / both_no / overboard
--   = undirected user_a_id/user_b_id + shared counts via metric_value
--   Do NOT join those views. Do NOT invent a/b split.
--
-- App-confirmed (Prisma schema / ban.service) — still verify via INTROSPECTION_15:
--   source table: public."Ban"
--   initiator: "senderId"
--   reactor:   "receiverId"
--   outcomes:  Ban.outcome ∈ {BOTH_YES, BOTH_NO, OVERBOARD}
--   exclude:   SPLIT, TIMEOUT, EXPIRED; BanStatus.FAILED is status not outcome
--   timestamps: "createdAt", "completedAt" (prefer completedAt for last_*)
--
-- Formulas:
--   viewerRespectScore = completed / (completed+failed+overboard)
--   otherRespectScore  = same for other direction
--   respect_share = round(viewer / (viewer+other), 4)
--   NULL if either denom=0 OR viewer+other=0  (no 0.5000 fallback)
--
-- sample_size = viewerDenominator + otherDenominator
--   (two opposite directed Ban sets — not double-counting the same row)
-- =============================================================================

-- #############################################################################
-- 0) Optional pre-check — display_order uniqueness (catalog)
-- #############################################################################
/*
select
  i.relname as index_name,
  ix.indisunique as is_unique,
  pg_get_indexdef(i.oid) as index_def
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join pg_index ix on ix.indrelid = t.oid
join pg_class i on i.oid = ix.indexrelid
where n.nspname = 'analytics'
  and t.relname = 'dimension_definition';

select code, display_order
from analytics.dimension_definition
where is_active = true
order by display_order, code;
*/

-- #############################################################################
-- 1) CREATE VIEW analytics.v_pair_respect_v1
-- #############################################################################
-- Directionality:
--   viewerRespect: receiver=viewer, sender=other   (viewer reacted to other's ban)
--   otherRespect:  receiver=other,  sender=viewer  (other reacted to viewer's ban)
-- Pair orientation: undirected pair keys + UNION ALL both directions
--   (replace with directional_facts pattern after INTROSPECTION_16 if different)
-- #############################################################################

/*
create or replace view analytics.v_pair_respect_v1 as
with directed as (
  select
    b."receiverId" as reactor_id,
    b."senderId"   as initiator_id,
    count(*) filter (where b.outcome = 'BOTH_YES')::int  as completed_count,
    count(*) filter (where b.outcome = 'BOTH_NO')::int   as failed_count,
    count(*) filter (where b.outcome = 'OVERBOARD')::int as overboard_count,
    min(b."createdAt") as first_at,
    max(coalesce(b."completedAt", b."createdAt")) as last_at
  from public."Ban" b
  where b.outcome in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD')
  group by b."receiverId", b."senderId"
),
pairs as (
  select distinct
    least(reactor_id, initiator_id) as user_a_id,
    greatest(reactor_id, initiator_id) as user_b_id
  from directed
),
oriented as (
  -- A as viewer, B as other
  select
    p.user_a_id as viewer_user_id,
    p.user_b_id as other_user_id,
    coalesce(d_ab.completed_count, 0) as viewer_completed_count,
    coalesce(d_ab.failed_count, 0)    as viewer_failed_count,
    coalesce(d_ab.overboard_count, 0) as viewer_overboard_count,
    coalesce(d_ba.completed_count, 0) as other_completed_count,
    coalesce(d_ba.failed_count, 0)    as other_failed_count,
    coalesce(d_ba.overboard_count, 0) as other_overboard_count,
    least(
      coalesce(d_ab.first_at, d_ba.first_at),
      coalesce(d_ba.first_at, d_ab.first_at)
    ) as first_interaction_at,
    greatest(
      coalesce(d_ab.last_at, d_ba.last_at),
      coalesce(d_ba.last_at, d_ab.last_at)
    ) as last_interaction_at
  from pairs p
  left join directed d_ab
    on d_ab.reactor_id = p.user_a_id
   and d_ab.initiator_id = p.user_b_id
  left join directed d_ba
    on d_ba.reactor_id = p.user_b_id
   and d_ba.initiator_id = p.user_a_id

  union all

  -- B as viewer, A as other
  select
    p.user_b_id,
    p.user_a_id,
    coalesce(d_ba.completed_count, 0),
    coalesce(d_ba.failed_count, 0),
    coalesce(d_ba.overboard_count, 0),
    coalesce(d_ab.completed_count, 0),
    coalesce(d_ab.failed_count, 0),
    coalesce(d_ab.overboard_count, 0),
    least(
      coalesce(d_ab.first_at, d_ba.first_at),
      coalesce(d_ba.first_at, d_ab.first_at)
    ),
    greatest(
      coalesce(d_ab.last_at, d_ba.last_at),
      coalesce(d_ba.last_at, d_ab.last_at)
    )
  from pairs p
  left join directed d_ab
    on d_ab.reactor_id = p.user_a_id
   and d_ab.initiator_id = p.user_b_id
  left join directed d_ba
    on d_ba.reactor_id = p.user_b_id
   and d_ba.initiator_id = p.user_a_id
),
scored as (
  select
    o.*,
    (o.viewer_completed_count + o.viewer_failed_count + o.viewer_overboard_count)
      as viewer_denominator,
    (o.other_completed_count + o.other_failed_count + o.other_overboard_count)
      as other_denominator,
    case
      when (o.viewer_completed_count + o.viewer_failed_count + o.viewer_overboard_count) > 0
        then o.viewer_completed_count::numeric
             / (
                 o.viewer_completed_count
                 + o.viewer_failed_count
                 + o.viewer_overboard_count
               )::numeric
      else null
    end as viewer_respect_score,
    case
      when (o.other_completed_count + o.other_failed_count + o.other_overboard_count) > 0
        then o.other_completed_count::numeric
             / (
                 o.other_completed_count
                 + o.other_failed_count
                 + o.other_overboard_count
               )::numeric
      else null
    end as other_respect_score
  from oriented o
)
select
  s.viewer_user_id,
  s.other_user_id,
  s.viewer_completed_count,
  s.viewer_failed_count,
  s.viewer_overboard_count,
  s.viewer_respect_score,
  s.other_completed_count,
  s.other_failed_count,
  s.other_overboard_count,
  s.other_respect_score,
  case
    when s.viewer_denominator = 0 or s.other_denominator = 0 then null
    when s.viewer_respect_score is null or s.other_respect_score is null then null
    when (s.viewer_respect_score + s.other_respect_score) = 0 then null
    else round(
      s.viewer_respect_score
        / (s.viewer_respect_score + s.other_respect_score),
      4
    )
  end as respect_share,
  (s.viewer_denominator + s.other_denominator) as sample_size,
  jsonb_build_object(
    'viewerCompletedCount', s.viewer_completed_count,
    'viewerFailedCount', s.viewer_failed_count,
    'viewerOverboardCount', s.viewer_overboard_count,
    'viewerRespectScore', s.viewer_respect_score,
    'otherCompletedCount', s.other_completed_count,
    'otherFailedCount', s.other_failed_count,
    'otherOverboardCount', s.other_overboard_count,
    'otherRespectScore', s.other_respect_score,
    'viewerDenominator', s.viewer_denominator,
    'otherDenominator', s.other_denominator,
    'relativeRespectShare',
      case
        when s.viewer_denominator = 0 or s.other_denominator = 0 then null
        when s.viewer_respect_score is null or s.other_respect_score is null then null
        when (s.viewer_respect_score + s.other_respect_score) = 0 then null
        else round(
          s.viewer_respect_score
            / (s.viewer_respect_score + s.other_respect_score),
          4
        )
      end
  ) as supporting_facts,
  s.first_interaction_at,
  s.last_interaction_at,
  case
    when s.first_interaction_at is null or s.last_interaction_at is null then null
    else (s.last_interaction_at::date - s.first_interaction_at::date)
  end as relationship_days
from scored s
where s.viewer_denominator > 0
   or s.other_denominator > 0;

comment on view analytics.v_pair_respect_v1 is
  'RESPECT pair source: absolute scores + relative respect_share. No publishable/confidence.';
*/

-- #############################################################################
-- 2) CREATE OR REPLACE VIEW analytics.v_relationship_metric_values_v1
-- #############################################################################
-- CRITICAL:
--   Do NOT invent initiative_share / responsiveness_share SQL.
--   Paste the exact live body from INTROSPECTION_16 (§C metric_values def)
--   between the markers, then keep the third UNION ALL branch below.
--   Existing two branches must remain byte-identical aside from formatting.
-- #############################################################################

/*
create or replace view analytics.v_relationship_metric_values_v1 as

-- ===== BEGIN PASTE: existing initiative_share UNION ALL responsiveness_share =====
-- (paste full current view body from:
--    select pg_get_viewdef('analytics.v_relationship_metric_values_v1'::regclass, true);
--  Do not edit those two branches.)
-- ===== END PASTE =====

UNION ALL

select
  r.viewer_user_id,
  r.other_user_id,
  'respect_share'::text as metric_code,
  r.respect_share as metric_value,
  r.sample_size,
  r.supporting_facts,
  r.first_interaction_at,
  r.last_interaction_at,
  r.relationship_days
from analytics.v_pair_respect_v1 r
where r.respect_share is not null;
*/

-- #############################################################################
-- 3) Catalog INSERT — RESPECT only (idempotent)
-- #############################################################################
-- display_order = 250 (between RESPONSIVENESS=200 and RECIPROCITY=300)
-- #############################################################################

/*
insert into analytics.dimension_definition (
  code,
  name,
  short_description,
  metric_code,
  display_order,
  version,
  is_active
)
select
  'RESPECT',
  'Respect',
  'Насколько участники уважают принятые запреты друг друга.',
  'respect_share',
  250,
  1,
  true
where not exists (
  select 1
  from analytics.dimension_definition d
  where d.code = 'RESPECT'
);

insert into analytics.dimension_rule (
  id,
  dimension_code,
  metric_code,
  rule_order,
  min_value,
  max_value,
  result_code,
  result_name,
  description,
  version,
  is_active
)
select
  gen_random_uuid(),
  v.dimension_code,
  v.metric_code,
  v.rule_order,
  v.min_value,
  v.max_value,
  v.result_code,
  v.result_name,
  v.description,
  v.version,
  v.is_active
from (
  values
    ('RESPECT'::text, 'respect_share'::text, 1, 0.0000::numeric, 0.3500::numeric,
     'OTHER_HIGHER'::text, 'Other Higher'::text,
     'Другой человек заметно чаще выполняет принятые запреты.'::text, 1, true),
    ('RESPECT', 'respect_share', 2, 0.3500, 0.4500,
     'OTHER_SLIGHTLY_HIGHER', 'Other Slightly Higher',
     'Другой человек немного чаще выполняет принятые запреты.', 1, true),
    ('RESPECT', 'respect_share', 3, 0.4500, 0.5500,
     'BALANCED', 'Balanced',
     'Вы примерно одинаково выполняете принятые запреты друг друга.', 1, true),
    ('RESPECT', 'respect_share', 4, 0.5500, 0.6500,
     'VIEWER_SLIGHTLY_HIGHER', 'Viewer Slightly Higher',
     'Viewer немного чаще выполняет принятые запреты другого человека.', 1, true),
    ('RESPECT', 'respect_share', 5, 0.6500, 1.0001,
     'VIEWER_HIGHER', 'Viewer Higher',
     'Viewer заметно чаще выполняет принятые запреты другого человека.', 1, true)
) as v(
  dimension_code, metric_code, rule_order, min_value, max_value,
  result_code, result_name, description, version, is_active
)
where not exists (
  select 1
  from analytics.dimension_rule r
  where r.dimension_code = v.dimension_code
    and r.metric_code = v.metric_code
    and r.result_code = v.result_code
);

insert into analytics.confidence_rule (
  id,
  object_type,
  object_code,
  rule_order,
  min_sample_size,
  max_sample_size,
  confidence_code,
  confidence_score,
  result_name,
  description,
  version,
  is_active
)
select
  gen_random_uuid(),
  v.object_type,
  v.object_code,
  v.rule_order,
  v.min_sample_size,
  v.max_sample_size,
  v.confidence_code,
  v.confidence_score,
  v.result_name,
  v.description,
  v.version,
  v.is_active
from (
  values
    ('DIMENSION'::text, 'RESPECT'::text, 1, 0::numeric, 5::numeric,
     'INSUFFICIENT'::text, 0.1000::numeric, 'Insufficient Data'::text,
     'Недостаточно завершённых взаимодействий для вывода об уважении.'::text, 1, true),
    ('DIMENSION', 'RESPECT', 2, 5, 20,
     'LOW', 0.3000, 'Low Confidence',
     'Данных пока мало; результат по уважению является предварительным.', 1, true),
    ('DIMENSION', 'RESPECT', 3, 20, 50,
     'MODERATE', 0.5500, 'Moderate Confidence',
     'Данных достаточно для осторожного вывода об уважении.', 1, true),
    ('DIMENSION', 'RESPECT', 4, 50, 200,
     'HIGH', 0.8000, 'High Confidence',
     'Вывод об уважении подтверждён большим количеством взаимодействий.', 1, true),
    ('DIMENSION', 'RESPECT', 5, 200, null::numeric,
     'VERY_HIGH', 0.9500, 'Very High Confidence',
     'Вывод об уважении подтверждён очень большим количеством взаимодействий.', 1, true)
) as v(
  object_type, object_code, rule_order, min_sample_size, max_sample_size,
  confidence_code, confidence_score, result_name, description, version, is_active
)
where not exists (
  select 1
  from analytics.confidence_rule c
  where c.object_type = v.object_type
    and c.object_code = v.object_code
    and c.confidence_code = v.confidence_code
);
*/

-- #############################################################################
-- 4) dashboard_v7 — DEFERRED
-- #############################################################################
-- Separate patch only after RESPECT appears in v_dimensions_universal_v1.
-- #############################################################################
