-- =============================================================================
-- APPLY_READY_respect_v2.sql
-- status: DO NOT APPLY / DO NOT RUN IN PRODUCTION
-- version: 2.2
-- PART 2 status: COMPLETE — live initiative + responsiveness + respect_share
-- =============================================================================
-- Architecture research CLOSED.
--
-- Production source for RESPECT (confirmed):
--   public.analytics_ban_facts
--   columns: sender_id, receiver_id, outcome, status,
--            created_at, handled_at, completed_at
--
-- REJECTED forever:
--   analytics.v_pair_survived_count
--   analytics.v_pair_both_no_count
--   analytics.v_pair_overboard_count
--   (undirected user_a/user_b shared counts)
--
-- Apply order (manual, later — only after explicit approval):
--   1) CREATE VIEW analytics.v_pair_respect_v1
--   2) CREATE OR REPLACE VIEW analytics.v_relationship_metric_values_v1
--      (paste existing initiative + responsiveness branches + respect_share)
--   3) Catalog INSERT definition → rules → confidence
--   4) dashboard_v7 — NOT required for this package
--
-- ALL SQL below is inside block comments. Do not uncomment until approved.
-- =============================================================================

-- #############################################################################
-- PART 1 — CREATE VIEW analytics.v_pair_respect_v1
-- #############################################################################
-- Directed aggregates from analytics_ban_facts:
--   reactor   = receiver_id
--   initiator = sender_id
--
-- Oriented rows (two per undirected pair):
--   row1: viewer = receiver_id, other = sender_id
--   row2: viewer = sender_id,   other = receiver_id
--
-- Counts always by receiver role:
--   viewerRespect: receiver_id = viewer, sender_id = other
--   otherRespect:  receiver_id = other,  sender_id = viewer
--
-- Outcomes:
--   completed = BOTH_YES
--   failed    = BOTH_NO
--   overboard = OVERBOARD
--   exclude   = SPLIT, TIMEOUT, EXPIRED
--   FAILED    = status only — not an outcome filter
--
-- NULL guards:
--   denom == 0 → score NULL, respect_share NULL
--   viewerScore + otherScore == 0 → respect_share NULL
-- #############################################################################

/*
create or replace view analytics.v_pair_respect_v1 as
with directed as (
  select
    f.receiver_id as reactor_id,
    f.sender_id   as initiator_id,
    count(*) filter (where f.outcome = 'BOTH_YES')::int  as completed_count,
    count(*) filter (where f.outcome = 'BOTH_NO')::int   as failed_count,
    count(*) filter (where f.outcome = 'OVERBOARD')::int as overboard_count,
    min(f.created_at) as first_at,
    max(coalesce(f.completed_at, f.handled_at, f.created_at)) as last_at
  from public.analytics_ban_facts f
  where f.outcome in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD')
  group by f.receiver_id, f.sender_id
),
pairs as (
  select distinct
    least(reactor_id, initiator_id) as user_a_id,
    greatest(reactor_id, initiator_id) as user_b_id
  from directed
),
oriented as (
  -- row1: viewer = A path via receiver=A sender=B when A < B naming;
  -- concrete: viewer reacts as receiver to other's bans
  select
    p.user_a_id as viewer_user_id,
    p.user_b_id as other_user_id,
    coalesce(d_viewer.completed_count, 0) as viewer_completed_count,
    coalesce(d_viewer.failed_count, 0)    as viewer_failed_count,
    coalesce(d_viewer.overboard_count, 0) as viewer_overboard_count,
    coalesce(d_other.completed_count, 0)  as other_completed_count,
    coalesce(d_other.failed_count, 0)     as other_failed_count,
    coalesce(d_other.overboard_count, 0)  as other_overboard_count,
    least(
      coalesce(d_viewer.first_at, d_other.first_at),
      coalesce(d_other.first_at, d_viewer.first_at)
    ) as first_interaction_at,
    greatest(
      coalesce(d_viewer.last_at, d_other.last_at),
      coalesce(d_other.last_at, d_viewer.last_at)
    ) as last_interaction_at
  from pairs p
  left join directed d_viewer
    on d_viewer.reactor_id = p.user_a_id
   and d_viewer.initiator_id = p.user_b_id
  left join directed d_other
    on d_other.reactor_id = p.user_b_id
   and d_other.initiator_id = p.user_a_id

  union all

  select
    p.user_b_id as viewer_user_id,
    p.user_a_id as other_user_id,
    coalesce(d_other.completed_count, 0),
    coalesce(d_other.failed_count, 0),
    coalesce(d_other.overboard_count, 0),
    coalesce(d_viewer.completed_count, 0),
    coalesce(d_viewer.failed_count, 0),
    coalesce(d_viewer.overboard_count, 0),
    least(
      coalesce(d_viewer.first_at, d_other.first_at),
      coalesce(d_other.first_at, d_viewer.first_at)
    ),
    greatest(
      coalesce(d_viewer.last_at, d_other.last_at),
      coalesce(d_other.last_at, d_viewer.last_at)
    )
  from pairs p
  left join directed d_viewer
    on d_viewer.reactor_id = p.user_a_id
   and d_viewer.initiator_id = p.user_b_id
  left join directed d_other
    on d_other.reactor_id = p.user_b_id
   and d_other.initiator_id = p.user_a_id
),
scored as (
  select
    o.*,
    (o.viewer_completed_count + o.viewer_failed_count + o.viewer_overboard_count)
      as viewer_denominator,
    (o.other_completed_count + o.other_failed_count + o.other_overboard_count)
      as other_denominator,
    case
      when (o.viewer_completed_count + o.viewer_failed_count + o.viewer_overboard_count) = 0
        then null
      else o.viewer_completed_count::numeric
           / (
               o.viewer_completed_count
               + o.viewer_failed_count
               + o.viewer_overboard_count
             )::numeric
    end as viewer_respect_score,
    case
      when (o.other_completed_count + o.other_failed_count + o.other_overboard_count) = 0
        then null
      else o.other_completed_count::numeric
           / (
               o.other_completed_count
               + o.other_failed_count
               + o.other_overboard_count
             )::numeric
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
    'viewer_completed_count', s.viewer_completed_count,
    'viewer_failed_count', s.viewer_failed_count,
    'viewer_overboard_count', s.viewer_overboard_count,
    'viewer_denominator', s.viewer_denominator,
    'viewer_respect_score', s.viewer_respect_score,
    'other_completed_count', s.other_completed_count,
    'other_failed_count', s.other_failed_count,
    'other_overboard_count', s.other_overboard_count,
    'other_denominator', s.other_denominator,
    'other_respect_score', s.other_respect_score,
    'relative_respect_share',
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
  'RESPECT v1 from public.analytics_ban_facts. Directed receiver-role scores + relative respect_share.';
*/

-- #############################################################################
-- PART 2 — CREATE OR REPLACE VIEW analytics.v_relationship_metric_values_v1
-- #############################################################################
-- Live body (initiative_share UNION ALL responsiveness_share) pasted verbatim
-- from production pg_get_viewdef / confirmed SELECT text.
-- Third branch: respect_share from analytics.v_pair_respect_v1.
-- Do NOT edit the first two branches.
--
-- Column contract (every branch, same order):
--   1 viewer_user_id
--   2 other_user_id
--   3 metric_code
--   4 metric_value
--   5 sample_size
--   6 supporting_facts
--   7 first_interaction_at
--   8 last_interaction_at
--   9 relationship_days
-- #############################################################################

/*
create or replace view analytics.v_relationship_metric_values_v1 as

SELECT
    m.viewer_user_id,
    m.other_user_id,
    'initiative_share'::text AS metric_code,
    m.initiative_share AS metric_value,
    m.interaction_count AS sample_size,
    jsonb_build_object(
        'banSentCount', m.ban_sent_count,
        'banReceivedCount', m.ban_received_count,
        'totalDirectionalBanCount', m.total_directional_ban_count
    ) AS supporting_facts,
    m.first_interaction_at,
    m.last_interaction_at,
    m.relationship_days
FROM analytics.v_relationship_metrics_v0 m
WHERE m.initiative_share IS NOT NULL

UNION ALL

SELECT
    m.viewer_user_id,
    m.other_user_id,
    'responsiveness_share'::text AS metric_code,
    CASE
        WHEN m.viewer_reply_rate IS NULL
         AND m.other_reply_rate IS NULL
            THEN NULL::numeric
        WHEN (
            COALESCE(m.viewer_reply_rate, 0::numeric)
            + COALESCE(m.other_reply_rate, 0::numeric)
        ) = 0::numeric
            THEN 0.5000
        ELSE round(
            COALESCE(m.viewer_reply_rate, 0::numeric)
            /
            NULLIF(
                COALESCE(m.viewer_reply_rate, 0::numeric)
                + COALESCE(m.other_reply_rate, 0::numeric),
                0::numeric
            ),
            4
        )
    END AS metric_value,
    m.total_directional_ban_count AS sample_size,
    jsonb_build_object(
        'viewerReplyRate', m.viewer_reply_rate,
        'otherReplyRate', m.other_reply_rate,
        'replyRateDelta', m.reply_rate_delta,
        'replySentCount', m.reply_sent_count,
        'replyReceivedCount', m.reply_received_count,
        'receivedByViewerCount', m.ban_received_count,
        'receivedByOtherCount', m.ban_sent_count
    ) AS supporting_facts,
    m.first_interaction_at,
    m.last_interaction_at,
    m.relationship_days
FROM analytics.v_relationship_metrics_v0 m
WHERE m.viewer_reply_rate IS NOT NULL
   OR m.other_reply_rate IS NOT NULL

UNION ALL

SELECT
    r.viewer_user_id,
    r.other_user_id,
    'respect_share'::text AS metric_code,
    r.respect_share AS metric_value,
    r.sample_size,
    r.supporting_facts,
    r.first_interaction_at,
    r.last_interaction_at,
    r.relationship_days
FROM analytics.v_pair_respect_v1 r
WHERE r.respect_share IS NOT NULL;
*/

-- #############################################################################
-- PART 3 — dimension_definition (RESPECT)
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
*/

-- #############################################################################
-- PART 4 — dimension_rule (same bands as INITIATIVE / RESPONSIVENESS)
-- #############################################################################

/*
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
*/

-- #############################################################################
-- PART 5 — confidence_rule (same bands as INITIATIVE / RESPONSIVENESS)
-- #############################################################################

/*
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
-- PART 6 — Validation checklist (manual, pre-apply)
-- #############################################################################
-- □ source = public.analytics_ban_facts
-- □ directionality сохранена (sender_id / receiver_id)
-- □ pair views не используются
-- □ NULL guards присутствуют
-- □ respect_share = NULL при нулевых знаменателях / нулевой сумме score
-- □ metric contract совпадает с initiative/responsiveness
-- □ PART 2: live initiative_share + responsiveness_share pasted verbatim
-- □ PART 2: existing branches unmodified
-- □ PART 2: respect_share is third UNION ALL only
-- □ type casts (if any) only on RESPECT branch — none required at paste time
-- □ dashboard_v7 менять НЕ требуется
-- □ SQL полностью закомментирован
-- □ Production не изменяется
-- #############################################################################
