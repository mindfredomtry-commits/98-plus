-- =============================================================================
-- APPLY_READY_dashboard_v8.sql
-- status: DO NOT APPLY / DO NOT RUN IN PRODUCTION
-- version: 1.0
-- =============================================================================
-- Purpose:
--   CREATE OR REPLACE VIEW analytics.v_relationship_dashboard_v8
--
-- Base dashboard source:
--   analytics.v_relationship_dashboard_v7  (unchanged — v7 stays live)
--
-- What changes in v8:
--   Rebuild dashboard_payload.relationshipScreen from
--   analytics.v_dimensions_universal_v1 (no INITIATIVE/RESPONSIVENESS allowlist,
--   no THIRD_DIMENSION_PENDING placeholder).
--
-- Prerequisites (must already exist in production before apply):
--   analytics.v_relationship_dashboard_v7
--   analytics.v_dimensions_universal_v1  (RESPECT row included)
--   public."User"
--
-- Apply order (manual, later — only after explicit approval):
--   1) CREATE OR REPLACE VIEW analytics.v_relationship_dashboard_v8
--   2) Parity smoke on golden pair (validation queries at file end)
--   3) Wire get_relationship_dashboard_v1 → v8 (separate change — NOT in this file)
--
-- ALL executable SQL below is inside block comments. Do not uncomment until approved.
-- =============================================================================

/*
create or replace view analytics.v_relationship_dashboard_v8 as
with source_rows as (
  select
    d.viewer_user_id,
    d.other_user_id,
    d.profile_status,
    d.headline_code,
    d.summary_text,
    d.confidence_code,
    d.sample_size,
    d.relationship_days,
    d.dashboard_payload,
    coalesce(
      nullif(trim(u."firstName"), ''),
      nullif(trim(u.username), ''),
      'собеседник'
    ) as other_display_name,
    coalesce(
      d.dashboard_payload #>> '{relationshipScreen,relationshipOrb,centerLabel}',
      '98+'
    ) as orb_center_label,
    d.dashboard_payload -> 'relationshipScreen' -> 'contractVersion' as screen_contract_version,
    d.dashboard_payload -> 'relationshipScreen' -> 'title' as screen_title,
    d.dashboard_payload -> 'relationshipScreen' -> 'peer' as screen_peer,
    d.dashboard_payload -> 'relationshipScreen' -> 'recommendation' as screen_recommendation,
    d.dashboard_payload -> 'relationshipScreen' -> 'primaryAction' as screen_primary_action,
    d.dashboard_payload -> 'relationshipScreen' -> 'weeklyDynamics' as screen_weekly_dynamics,
    d.dashboard_payload -> 'relationshipScreen' -> 'meta' as screen_meta
  from analytics.v_relationship_dashboard_v7 d
  left join "User" u
    on u.id = d.other_user_id
),

-- Universal dimensions for the viewer/other pair.
-- No hardcoded dimension_code allowlist; is_active is enforced upstream.
dimension_rows as (
  select
    sr.viewer_user_id,
    sr.other_user_id,
    sr.other_display_name,
    dim.dimension_code,
    dim.dimension_name,
    dim.display_order,
    dim.metric_code,
    dim.score,
    dim.sample_size,
    dim.supporting_facts,
    dim.result_code,
    dim.result_name,
    dim.description,
    dim.confidence_code,
    dim.confidence_score,
    dim.confidence_name,
    dim.confidence_description,
    dim.is_publishable,
    dim.published_result_code,
    dense_rank() over (
      partition by sr.viewer_user_id, sr.other_user_id
      order by dim.display_order asc, dim.dimension_code asc
    ) as display_order_rank
  from source_rows sr
  join analytics.v_dimensions_universal_v1 dim
    on dim.viewer_user_id = sr.viewer_user_id
   and dim.other_user_id = sr.other_user_id
  where dim.dimension_code <> 'THIRD_DIMENSION_PENDING'
),

-- Preserve INITIATIVE / RESPONSIVENESS orb descriptions verbatim from live v7.
v7_dimension_descriptions as (
  select
    d.viewer_user_id,
    d.other_user_id,
    x ->> 'code' as dimension_code,
    x ->> 'description' as v7_description
  from analytics.v_relationship_dashboard_v7 d
  cross join lateral jsonb_array_elements(
    coalesce(
      d.dashboard_payload #> '{relationshipScreen,relationshipOrb,dimensions}',
      '[]'::jsonb
    )
  ) x
  where x ->> 'code' in ('INITIATIVE', 'RESPONSIVENESS')
),

dimension_enriched as (
  select
    dr.*,
    case dr.display_order_rank
      when 1 then 'OUTER'
      when 2 then 'MIDDLE'
      when 3 then 'INNER'
      else null
    end as ring_code,
    case dr.dimension_code
      when 'INITIATIVE' then 'Инициатива'
      when 'RESPONSIVENESS' then 'Ответность'
      when 'RESPECT' then 'Уважение'
      else dr.dimension_name
    end as localized_title,
    case
      when dr.dimension_code in ('INITIATIVE', 'RESPONSIVENESS') then
        v7.v7_description
      when dr.dimension_code = 'RESPECT' then
        case
          when dr.is_publishable is not true then
            'Пока недостаточно данных, чтобы устойчиво сравнить, как вы выполняете принятые запреты.'
          when analytics.relationship_metric_direction_v1(dr.score) = 'VIEWER' then
            concat(
              'Ты чаще выполняешь принятые запреты ',
              dr.other_display_name,
              '.'
            )
          when analytics.relationship_metric_direction_v1(dr.score) = 'OTHER' then
            concat(
              dr.other_display_name,
              ' чаще выполняет принятые запреты, чем ты.'
            )
          else
            'Вы примерно одинаково выполняете принятые запреты друг друга.'
        end
      else dr.description
    end as localized_description
  from dimension_rows dr
  left join v7_dimension_descriptions v7
    on v7.viewer_user_id = dr.viewer_user_id
   and v7.other_user_id = dr.other_user_id
   and v7.dimension_code = dr.dimension_code
),

dimension_json as (
  select
    de.viewer_user_id,
    de.other_user_id,
    de.display_order,
    de.dimension_code,
    de.display_order_rank,
    de.ring_code,
    jsonb_build_object(
      'code', de.dimension_code,
      'ring', de.ring_code,
      'available', de.score is not null,
      'publishable', coalesce(de.is_publishable, false),
      'viewerShare', de.score,
      'otherShare',
        case
          when de.score is null then null
          else 1::numeric - de.score
        end,
      'displayValue',
        case
          when de.score is null then null
          else concat(round(de.score * 100::numeric), '%')
        end,
      'direction',
        case
          when de.is_publishable is not true then 'LOW_DATA'
          else analytics.relationship_metric_direction_v1(de.score)
        end,
      'title', de.localized_title,
      'description', de.localized_description,
      'confidenceCode', de.confidence_code,
      'confidenceScore', de.confidence_score,
      'sampleSize', de.sample_size,
      'metricCode', de.metric_code,
      'resultCode', de.result_code,
      'resultName', de.result_name,
      'supportingFacts', de.supporting_facts
    ) as dimension_object
  from dimension_enriched de
),

-- Summary depends only on INITIATIVE (same thresholds as orb direction).
initiative_ctx as (
  select
    de.viewer_user_id,
    de.other_user_id,
    de.score as initiative_score,
    de.is_publishable as initiative_publishable
  from dimension_enriched de
  where de.dimension_code = 'INITIATIVE'
),

all_dimensions_agg as (
  select
    dj.viewer_user_id,
    dj.other_user_id,
    jsonb_agg(
      dj.dimension_object
      order by dj.display_order asc, dj.dimension_code asc
    ) as all_dimensions
  from dimension_json dj
  group by dj.viewer_user_id, dj.other_user_id
),

orb_dimensions_agg as (
  select
    dj.viewer_user_id,
    dj.other_user_id,
    jsonb_agg(
      dj.dimension_object
      order by dj.display_order asc, dj.dimension_code asc
    ) as orb_dimensions
  from dimension_json dj
  where dj.display_order_rank <= 3
  group by dj.viewer_user_id, dj.other_user_id
),

relationship_screen_rebuilt as (
  select
    sr.viewer_user_id,
    sr.other_user_id,
    jsonb_build_object(
      'contractVersion', coalesce(sr.screen_contract_version, '1'::jsonb),
      'title', sr.screen_title,
      'peer', sr.screen_peer,
      'summary',
        coalesce(
          sr.dashboard_payload #>> '{relationshipScreen,summary}',
          case
            when ic.initiative_publishable is not true
              or ic.initiative_score is null then
              'Пока недостаточно данных, чтобы устойчиво сравнить, кто чаще начинает запреты.'
            when analytics.relationship_metric_direction_v1(ic.initiative_score) = 'VIEWER' then
              concat(
                'Ты чаще начинаешь запреты ',
                sr.other_display_name,
                '.'
              )
            when analytics.relationship_metric_direction_v1(ic.initiative_score) = 'OTHER' then
              concat(
                sr.other_display_name,
                ' чаще начинает запреты, чем ты.'
              )
            else
              'Вы примерно одинаково начинаете запреты друг друга.'
          end
        ),
      'relationshipOrb', jsonb_build_object(
        'centerLabel', sr.orb_center_label,
        'dimensions', coalesce(od.orb_dimensions, '[]'::jsonb)
      ),
      'allDimensions', coalesce(ad.all_dimensions, '[]'::jsonb),
      'recommendation', sr.screen_recommendation,
      'primaryAction', sr.screen_primary_action,
      'weeklyDynamics', sr.screen_weekly_dynamics,
      'meta',
        coalesce(sr.screen_meta, '{}'::jsonb)
        || jsonb_build_object('relationshipScreenVersion', 2)
    ) as relationship_screen
  from source_rows sr
  left join initiative_ctx ic
    on ic.viewer_user_id = sr.viewer_user_id
   and ic.other_user_id = sr.other_user_id
  left join orb_dimensions_agg od
    on od.viewer_user_id = sr.viewer_user_id
   and od.other_user_id = sr.other_user_id
  left join all_dimensions_agg ad
    on ad.viewer_user_id = sr.viewer_user_id
   and ad.other_user_id = sr.other_user_id
)

select
  sr.viewer_user_id,
  sr.other_user_id,
  sr.profile_status,
  sr.headline_code,
  sr.summary_text,
  sr.confidence_code,
  sr.sample_size,
  sr.relationship_days,
  sr.dashboard_payload
  || jsonb_build_object(
    'relationshipScreen', rs.relationship_screen
  )
  || jsonb_build_object(
    'meta',
    coalesce(sr.dashboard_payload -> 'meta', '{}'::jsonb)
    || jsonb_build_object(
      'dashboardVersion', 8,
      'relationshipScreenVersion', 2,
      'generatedAt', current_timestamp
    )
  ) as dashboard_payload
from source_rows sr
join relationship_screen_rebuilt rs
  on rs.viewer_user_id = sr.viewer_user_id
 and rs.other_user_id = sr.other_user_id;

comment on view analytics.v_relationship_dashboard_v8 is
  'Dashboard v8: v7 payload + universal relationshipScreen (dimensions from v_dimensions_universal_v1).';
*/

-- =============================================================================
-- PRE-APPLY CHECKLIST
-- =============================================================================
-- □ v_relationship_dashboard_v7 untouched
-- □ v_dimensions_universal_v1 returns RESPECT for golden pair
-- □ INITIATIVE/RESPONSIVENESS descriptions match v7 (via v7_dimension_descriptions)
-- □ summary parity on golden pair (initiative-only logic)
-- □ relationshipOrb.dimensions has exactly 3 rings: OUTER/MIDDLE/INNER
-- □ THIRD_DIMENSION_PENDING absent
-- □ insights / lifetime / patterns / timeline / recommendations / header / hero / orb / ui preserved
-- □ SQL fully commented
-- □ Production not changed by this file alone
-- =============================================================================

-- =============================================================================
-- VALIDATION QUERIES (read-only — run after CREATE VIEW v8)
-- =============================================================================

/*
select
  viewer_user_id,
  other_user_id,
  jsonb_pretty(
    dashboard_payload #> '{relationshipScreen,relationshipOrb,dimensions}'
  )
from analytics.v_relationship_dashboard_v8
where viewer_user_id = 'cmpg2eide000etkgwbhkwjb5z'
  and other_user_id = 'cmpiebpwt00rgpk0p87dyblug';

select
  jsonb_array_length(
    dashboard_payload #> '{relationshipScreen,relationshipOrb,dimensions}'
  ) as ring_dimension_count,
  jsonb_array_length(
    dashboard_payload #> '{relationshipScreen,allDimensions}'
  ) as all_dimension_count
from analytics.v_relationship_dashboard_v8
where viewer_user_id = 'cmpg2eide000etkgwbhkwjb5z'
  and other_user_id = 'cmpiebpwt00rgpk0p87dyblug';

select
  x ->> 'code' as dimension_code,
  x ->> 'ring' as ring,
  x ->> 'direction' as direction,
  x ->> 'displayValue' as display_value,
  x ->> 'confidenceCode' as confidence_code
from analytics.v_relationship_dashboard_v8 d
cross join lateral jsonb_array_elements(
  d.dashboard_payload #> '{relationshipScreen,relationshipOrb,dimensions}'
) x
where d.viewer_user_id = 'cmpg2eide000etkgwbhkwjb5z'
  and d.other_user_id = 'cmpiebpwt00rgpk0p87dyblug';
*/
