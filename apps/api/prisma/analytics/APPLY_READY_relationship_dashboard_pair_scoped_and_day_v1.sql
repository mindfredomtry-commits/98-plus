-- ============================================================

-- Relationship dashboard pair-scoped function

-- ============================================================

CREATE OR REPLACE FUNCTION analytics.get_relationship_dashboard_pair_scoped_v1(p_viewer_user_id text, p_other_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'analytics', 'public'
AS $function$
DECLARE
  v_dashboard jsonb;

  v_timeline jsonb;
  v_lifetime jsonb;
  v_patterns jsonb;
  v_interpretation jsonb;
  v_recommendations jsonb;

  v_peer_display_name text;
  v_short_display_name text;
  v_other_photo_url text;

  v_all_dimensions jsonb := '[]'::jsonb;
  v_orb_dimensions jsonb := '[]'::jsonb;

  v_initiative_score numeric;
  v_initiative_publishable boolean;
  v_responsiveness_publishable boolean;

  v_relationship_summary text;
  v_relationship_screen jsonb;
BEGIN
  /*
   * 1. Базовый Dashboard V1.
   * Проверено: golden pair формируется примерно за 1.5 секунды.
   */
  SELECT d.dashboard_payload
  INTO v_dashboard
  FROM analytics.v_relationship_dashboard_v1 AS d
  WHERE d.viewer_user_id = p_viewer_user_id
    AND d.other_user_id = p_other_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  /*
   * 2. Timeline — только выбранная пара.
   */
  SELECT jsonb_build_object(
    'firstActivityDate', t.first_activity_date,
    'lastActivityDate', t.last_activity_date,
    'activeDayCount', t.active_day_count,
    'days', COALESCE(t.timeline, '[]'::jsonb),
    'meta', COALESCE(
      t.metadata,
      jsonb_build_object(
        'contractVersion', 1,
        'ordering', 'newest_first'
      )
    )
  )
  INTO v_timeline
  FROM analytics.v_relationship_timeline_v1 AS t
  WHERE t.viewer_user_id = p_viewer_user_id
    AND t.other_user_id = p_other_user_id
  LIMIT 1;

  v_timeline := COALESCE(
    v_timeline,
    jsonb_build_object(
      'firstActivityDate', NULL,
      'lastActivityDate', NULL,
      'activeDayCount', NULL,
      'days', '[]'::jsonb,
      'meta', jsonb_build_object(
        'contractVersion', 1,
        'ordering', 'newest_first'
      )
    )
  );

  v_dashboard := jsonb_set(
    v_dashboard,
    '{timeline}',
    v_timeline,
    true
  );

  /*
   * 3. Lifetime — только выбранная пара.
   */
  SELECT l.lifetime_payload
  INTO v_lifetime
  FROM analytics.v_relationship_lifetime_v1 AS l
  WHERE l.viewer_user_id = p_viewer_user_id
    AND l.other_user_id = p_other_user_id
  LIMIT 1;

  v_lifetime := COALESCE(
    v_lifetime,
    jsonb_build_object(
      'status', 'NO_DATA',
      'meta', jsonb_build_object(
        'contractVersion', 1
      )
    )
  );

  v_dashboard := jsonb_set(
    v_dashboard,
    '{lifetime}',
    v_lifetime,
    true
  );

  /*
   * 4. Patterns — только выбранная пара.
   */
  SELECT p.patterns_payload
  INTO v_patterns
  FROM analytics.v_relationship_patterns_payload_v1 AS p
  WHERE p.viewer_user_id = p_viewer_user_id
    AND p.other_user_id = p_other_user_id
  LIMIT 1;

  v_patterns := COALESCE(
    v_patterns,
    jsonb_build_object(
      'status', 'NO_DATA',
      'count', 0,
      'publishableCount', 0,
      'items', '{}'::jsonb,
      'list', '[]'::jsonb,
      'meta', jsonb_build_object(
        'contractVersion', 1
      )
    )
  );

  v_dashboard := jsonb_set(
    v_dashboard,
    '{patterns}',
    v_patterns,
    true
  );

  /*
   * 5. Интерпретация паттернов — только выбранная пара.
   */
  SELECT i.interpretation_payload
  INTO v_interpretation
  FROM analytics.v_relationship_pattern_interpretations_v1 AS i
  WHERE i.viewer_user_id = p_viewer_user_id
    AND i.other_user_id = p_other_user_id
  LIMIT 1;

  v_interpretation := COALESCE(
    v_interpretation,
    jsonb_build_object(
      'code', 'NO_DATA',
      'title', 'Пока недостаточно данных',
      'summary', 'Интерпретация временных паттернов пока недоступна.',
      'confidence', 'LOW',
      'publishable', false,
      'evidence', '{}'::jsonb,
      'meta', jsonb_build_object(
        'contractVersion', 1
      )
    )
  );

  v_dashboard := jsonb_set(
    v_dashboard,
    '{patternInterpretation}',
    v_interpretation,
    true
  );

  /*
   * 6. Recommendations — только выбранная пара.
   */
  SELECT r.recommendations_payload
  INTO v_recommendations
  FROM analytics.v_relationship_recommendations_payload_v1 AS r
  WHERE r.viewer_user_id = p_viewer_user_id
    AND r.other_user_id = p_other_user_id
  LIMIT 1;

  v_recommendations := COALESCE(
    v_recommendations,
    jsonb_build_object(
      'status', 'NO_DATA',
      'count', 0,
      'publishableCount', 0,
      'highestPriority', NULL,
      'primary', '{}'::jsonb,
      'list', '[]'::jsonb,
      'meta', jsonb_build_object(
        'contractVersion', 1
      )
    )
  );

  v_dashboard := jsonb_set(
    v_dashboard,
    '{recommendations}',
    v_recommendations,
    true
  );

  /*
   * 7. Данные другого пользователя.
   */
  SELECT
    COALESCE(
      NULLIF(
        TRIM(
          concat_ws(
            ' ',
            u."firstName",
            u."lastName"
          )
        ),
        ''
      ),
      NULLIF(u.username, ''),
      'другой человек'
    ),
    COALESCE(
      NULLIF(TRIM(u."firstName"), ''),
      NULLIF(TRIM(u.username), ''),
      'собеседник'
    ),
    u."photoUrl"
  INTO
    v_peer_display_name,
    v_short_display_name,
    v_other_photo_url
  FROM public."User" AS u
  WHERE u.id = p_other_user_id
  LIMIT 1;

  v_peer_display_name :=
    COALESCE(v_peer_display_name, 'другой человек');

  v_short_display_name :=
    COALESCE(v_short_display_name, 'собеседник');

  /*
   * 8. Universal Dimensions — только выбранная пара.
   */
  WITH dimension_source AS MATERIALIZED (
    SELECT
      d.*,
      dense_rank() OVER (
        ORDER BY d.display_order, d.dimension_code
      ) AS display_order_rank
    FROM analytics.v_dimensions_universal_v1 AS d
    WHERE d.viewer_user_id = p_viewer_user_id
      AND d.other_user_id = p_other_user_id
      AND d.dimension_code <> 'THIRD_DIMENSION_PENDING'
  ),
  dimension_enriched AS (
    SELECT
      ds.*,

      CASE ds.display_order_rank
        WHEN 1 THEN 'OUTER'
        WHEN 2 THEN 'MIDDLE'
        WHEN 3 THEN 'INNER'
        ELSE NULL
      END AS ring_code,

      CASE ds.dimension_code
        WHEN 'INITIATIVE' THEN 'Инициатива'
        WHEN 'RESPONSIVENESS' THEN 'Ответность'
        WHEN 'RESPECT' THEN 'Уважение'
        ELSE ds.dimension_name
      END AS localized_title,

      CASE ds.dimension_code
        WHEN 'INITIATIVE' THEN
          CASE
            WHEN ds.is_publishable IS NOT TRUE THEN
              'Пока недостаточно данных, чтобы устойчиво определить, кто чаще начинает взаимодействие.'
            WHEN ds.score > 0.55 THEN
              concat(
                'Ты начинаешь запрещать чаще, чем ',
                v_peer_display_name,
                '.'
              )
            WHEN ds.score < 0.45 THEN
              concat(
                v_peer_display_name,
                ' начинает запрещать чаще, чем ты.'
              )
            ELSE
              'Вы начинаете запрещать примерно одинаково часто.'
          END

        WHEN 'RESPONSIVENESS' THEN
          CASE
            WHEN ds.is_publishable IS NOT TRUE THEN
              'Пока недостаточно данных, чтобы устойчиво сравнить ваши ответы.'
            WHEN ds.score > 0.55 THEN
              concat(
                'Ты чаще отвечаешь на действия ',
                v_peer_display_name,
                '.'
              )
            WHEN ds.score < 0.45 THEN
              concat(
                v_peer_display_name,
                ' чаще отвечает на твои действия.'
              )
            ELSE
              'Вы отвечаете друг другу примерно одинаково часто.'
          END

        WHEN 'RESPECT' THEN
          CASE
            WHEN ds.is_publishable IS NOT TRUE THEN
              'Пока недостаточно данных, чтобы устойчиво сравнить, как вы выполняете принятые запреты.'
            WHEN ds.score > 0.55 THEN
              concat(
                'Ты чаще выполняешь принятые запреты ',
                v_short_display_name,
                '.'
              )
            WHEN ds.score < 0.45 THEN
              concat(
                v_short_display_name,
                ' чаще выполняет принятые запреты, чем ты.'
              )
            ELSE
              'Вы примерно одинаково выполняете принятые запреты друг друга.'
          END

        ELSE ds.description
      END AS localized_description
    FROM dimension_source AS ds
  ),
  dimension_json AS (
    SELECT
      de.dimension_code,
      de.display_order,
      de.display_order_rank,
      de.score,
      de.is_publishable,

      jsonb_build_object(
        'code', de.dimension_code,
        'ring', de.ring_code,
        'available', de.score IS NOT NULL,
        'publishable', COALESCE(de.is_publishable, false),
        'viewerShare', de.score,
        'otherShare',
          CASE
            WHEN de.score IS NULL THEN NULL
            ELSE 1::numeric - de.score
          END,
        'displayValue',
          CASE
            WHEN de.score IS NULL THEN NULL
            ELSE concat(round(de.score * 100::numeric), '%')
          END,
        'direction',
          CASE
            WHEN de.is_publishable IS NOT TRUE THEN 'LOW_DATA'
            WHEN de.score > 0.55 THEN 'VIEWER'
            WHEN de.score < 0.45 THEN 'OTHER'
            ELSE 'BALANCED'
          END,
        'title', de.localized_title,
        'description', de.localized_description,
        'confidenceCode', de.confidence_code,
        'confidenceScore', de.confidence_score,
        'sampleSize', de.sample_size,
        'metricCode', de.metric_code,
        'resultCode', de.result_code,
        'resultName', de.result_name,
        'supportingFacts', de.supporting_facts
      ) AS dimension_object
    FROM dimension_enriched AS de
  )
  SELECT
    COALESCE(
      jsonb_agg(
        dj.dimension_object
        ORDER BY dj.display_order, dj.dimension_code
      ),
      '[]'::jsonb
    ),

    COALESCE(
      jsonb_agg(
        dj.dimension_object
        ORDER BY dj.display_order, dj.dimension_code
      ) FILTER (
        WHERE dj.display_order_rank <= 3
      ),
      '[]'::jsonb
    ),

    max(dj.score) FILTER (
      WHERE dj.dimension_code = 'INITIATIVE'
    ),

    bool_or(dj.is_publishable) FILTER (
      WHERE dj.dimension_code = 'INITIATIVE'
    ),

    bool_or(dj.is_publishable) FILTER (
      WHERE dj.dimension_code = 'RESPONSIVENESS'
    )
  INTO
    v_all_dimensions,
    v_orb_dimensions,
    v_initiative_score,
    v_initiative_publishable,
    v_responsiveness_publishable
  FROM dimension_json AS dj;

  /*
   * 9. Relationship summary — логика V7.
   */
  v_relationship_summary :=
    CASE
      WHEN v_initiative_publishable IS NOT TRUE
       AND v_responsiveness_publishable IS NOT TRUE
        THEN
          'Пока недостаточно данных, чтобы показать направление отношений.'

      WHEN COALESCE(v_initiative_score, 0.5) > 0.55
        THEN
          'Отношения сильнее смещены в твою сторону.'

      WHEN COALESCE(v_initiative_score, 0.5) < 0.45
        THEN
          concat(
            'Отношения сильнее смещены в сторону ',
            v_peer_display_name,
            '.'
          )

      ELSE
        'Отношения сейчас выглядят достаточно сбалансированными.'
    END;

  /*
   * 10. Relationship Screen V8.
   */
  v_relationship_screen := jsonb_build_object(
    'contractVersion', 1,
    'title', 'ваши отношения',

    'peer', jsonb_build_object(
      'userId', p_other_user_id,
      'displayName', v_peer_display_name,
      'avatarUrl', v_other_photo_url
    ),

    'summary', v_relationship_summary,

    'relationshipOrb', jsonb_build_object(
      'centerLabel', '98+',
      'dimensions', COALESCE(
        v_orb_dimensions,
        '[]'::jsonb
      )
    ),

    'allDimensions', COALESCE(
      v_all_dimensions,
      '[]'::jsonb
    ),

    'recommendation', COALESCE(
      v_dashboard #> '{recommendations,primary}',
      '{}'::jsonb
    ),

    'primaryAction', jsonb_build_object(
      'code', 'START_BAN',
      'label', 'запрещать'
    ),

    'weeklyDynamics', NULL,

    'meta', jsonb_build_object(
      'sourceDashboardVersion', 6,
      'relationshipScreenVersion', 2,
      'generatedAt', CURRENT_TIMESTAMP
    )
  );

  /*
   * 11. Финальный V8 payload.
   */
  v_dashboard :=
    v_dashboard
    || jsonb_build_object(
      'relationshipScreen',
      v_relationship_screen
    )
    || jsonb_build_object(
      'meta',
      COALESCE(
        v_dashboard -> 'meta',
        '{}'::jsonb
      )
      || jsonb_build_object(
        'dashboardVersion', 8,
        'timelineContractVersion', 1,
        'lifetimeContractVersion', 1,
        'patternsContractVersion', 1,
        'patternInterpretationContractVersion', 1,
        'recommendationsContractVersion', 1,
        'relationshipScreenVersion', 2,
        'generatedAt', CURRENT_TIMESTAMP
      )
    );

  RETURN v_dashboard;
END;
$function$
;

-- ============================================================

-- Relationship day analytics function

-- ============================================================

CREATE OR REPLACE FUNCTION analytics.get_relationship_day_v1(p_viewer_user_id text, p_other_user_id text, p_activity_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'analytics', 'public'
AS $function$
DECLARE
  v_other_display_name text;
  v_other_photo_url text;

  v_ban_sent bigint := 0;
  v_ban_received bigint := 0;
  v_reply_sent bigint := 0;
  v_reply_received bigint := 0;
  v_sent_accepted bigint := 0;
  v_received_accepted bigint := 0;
  v_sent_completed bigint := 0;
  v_received_completed bigint := 0;
  v_overboard bigint := 0;
  v_both_yes bigint := 0;
  v_both_no bigint := 0;
  v_split bigint := 0;
  v_timeout bigint := 0;
  v_expired bigint := 0;
  v_interactions bigint := 0;
  v_first_ban_id text;
  v_last_ban_id text;

  v_initiative_sample numeric;
  v_response_sample numeric;
  v_respect_sample numeric;

  v_initiative_score numeric;
  v_responsiveness_score numeric;
  v_respect_score numeric;

  v_viewer_respect_rate numeric;
  v_other_respect_rate numeric;

  v_summary text;
  v_day_screen jsonb;
BEGIN
  SELECT
    COALESCE(NULLIF(TRIM(BOTH FROM concat_ws(' ', u."firstName", u."lastName")), ''), NULLIF(u.username, ''), 'собеседник'),
    u."photoUrl"
  INTO v_other_display_name, v_other_photo_url
  FROM public."User" u
  WHERE u.id = p_other_user_id
  LIMIT 1;

  v_other_display_name := COALESCE(v_other_display_name, 'собеседник');

  SELECT
    COALESCE(d.ban_sent_count, 0),
    COALESCE(d.ban_received_count, 0),
    COALESCE(d.reply_sent_count, 0),
    COALESCE(d.reply_received_count, 0),
    COALESCE(d.sent_accepted_count, 0),
    COALESCE(d.received_accepted_count, 0),
    COALESCE(d.sent_completed_count, 0),
    COALESCE(d.received_completed_count, 0),
    COALESCE(d.overboard_count, 0),
    COALESCE(d.both_yes_count, 0),
    COALESCE(d.both_no_count, 0),
    COALESCE(d.split_count, 0),
    COALESCE(d.timeout_count, 0),
    COALESCE(d.expired_count, 0),
    COALESCE(d.interaction_count, 0),
    d.first_ban_id,
    d.last_ban_id
  INTO
    v_ban_sent,
    v_ban_received,
    v_reply_sent,
    v_reply_received,
    v_sent_accepted,
    v_received_accepted,
    v_sent_completed,
    v_received_completed,
    v_overboard,
    v_both_yes,
    v_both_no,
    v_split,
    v_timeout,
    v_expired,
    v_interactions,
    v_first_ban_id,
    v_last_ban_id
  FROM (SELECT 1) seed
  LEFT JOIN analytics.v_relationship_daily_facts_v1 d
    ON d.viewer_user_id = p_viewer_user_id
   AND d.other_user_id = p_other_user_id
   AND d.activity_date = p_activity_date;

  v_initiative_sample := v_ban_sent + v_ban_received;
  v_response_sample := v_reply_sent + v_reply_received;
  v_respect_sample := v_ban_sent + v_ban_received;

  v_initiative_score :=
    CASE
      WHEN v_initiative_sample > 0
      THEN round(v_ban_sent::numeric / v_initiative_sample, 4)
      ELSE NULL
    END;

  v_responsiveness_score :=
    CASE
      WHEN v_response_sample > 0
      THEN round(v_reply_sent::numeric / v_response_sample, 4)
      ELSE NULL
    END;

  v_viewer_respect_rate :=
    CASE
      WHEN v_ban_received > 0
      THEN LEAST(1::numeric, v_received_completed::numeric / v_ban_received::numeric)
      ELSE NULL
    END;

  v_other_respect_rate :=
    CASE
      WHEN v_ban_sent > 0
      THEN LEAST(1::numeric, v_sent_completed::numeric / v_ban_sent::numeric)
      ELSE NULL
    END;

  v_respect_score :=
    CASE
      WHEN v_viewer_respect_rate IS NULL
        OR v_other_respect_rate IS NULL
        OR (v_viewer_respect_rate + v_other_respect_rate) = 0
      THEN NULL
      ELSE round(v_viewer_respect_rate / (v_viewer_respect_rate + v_other_respect_rate), 4)
    END;

  v_summary :=
    CASE
      WHEN v_interactions = 0 THEN 'В этот день между вами не было действий.'
      WHEN v_initiative_score > 0.55 THEN 'В этот день ты чаще начинал взаимодействие.'
      WHEN v_initiative_score < 0.45 THEN concat('В этот день ', v_other_display_name, ' чаще начинал взаимодействие.')
      ELSE 'В этот день отношения выглядят достаточно сбалансированными.'
    END;

  v_day_screen := jsonb_build_object(
    'contractVersion', 1,
    'screen', 'RELATIONSHIP_DAY',
    'selectedDate', to_char(p_activity_date, 'YYYY-MM-DD'),
    'status', CASE WHEN v_interactions > 0 THEN 'HAS_DATA' ELSE 'NO_ACTIVITY' END,
    'title', 'ваши отношения',
    'peer', jsonb_build_object(
      'userId', p_other_user_id,
      'displayName', v_other_display_name,
      'avatarUrl', v_other_photo_url
    ),
    'summary', v_summary,
    'relationshipOrb', jsonb_build_object(
      'centerLabel', '98+',
      'dimensions', jsonb_build_array(
        jsonb_build_object(
          'code', 'INITIATIVE',
          'ring', 'OUTER',
          'available', v_initiative_score IS NOT NULL,
          'publishable', v_initiative_score IS NOT NULL,
          'viewerShare', v_initiative_score,
          'otherShare', CASE WHEN v_initiative_score IS NULL THEN NULL ELSE round(1 - v_initiative_score, 4) END,
          'displayValue', CASE WHEN v_initiative_score IS NULL THEN NULL ELSE concat(round(v_initiative_score * 100), '%') END,
          'direction',
            CASE
              WHEN v_initiative_score IS NULL THEN 'LOW_DATA'
              WHEN v_initiative_score > 0.55 THEN 'VIEWER'
              WHEN v_initiative_score < 0.45 THEN 'OTHER'
              ELSE 'BALANCED'
            END,
          'title', 'Инициатива',
          'description',
            CASE
              WHEN v_initiative_score IS NULL THEN 'В этот день вы не начинали запреты друг другу.'
              WHEN v_initiative_score > 0.55 THEN 'В этот день ты чаще начинал запреты.'
              WHEN v_initiative_score < 0.45 THEN concat('В этот день ', v_other_display_name, ' чаще начинал запреты.')
              ELSE 'В этот день вы начинали запреты примерно одинаково часто.'
            END,
          'confidenceCode', CASE WHEN v_initiative_sample >= 20 THEN 'HIGH' WHEN v_initiative_sample >= 5 THEN 'MEDIUM' WHEN v_initiative_sample > 0 THEN 'LOW' ELSE 'NO_DATA' END,
          'confidenceScore', LEAST(1::numeric, v_initiative_sample / 20),
          'sampleSize', v_initiative_sample
        ),
        jsonb_build_object(
          'code', 'RESPONSIVENESS',
          'ring', 'MIDDLE',
          'available', v_responsiveness_score IS NOT NULL,
          'publishable', v_responsiveness_score IS NOT NULL,
          'viewerShare', v_responsiveness_score,
          'otherShare', CASE WHEN v_responsiveness_score IS NULL THEN NULL ELSE round(1 - v_responsiveness_score, 4) END,
          'displayValue', CASE WHEN v_responsiveness_score IS NULL THEN NULL ELSE concat(round(v_responsiveness_score * 100), '%') END,
          'direction',
            CASE
              WHEN v_responsiveness_score IS NULL THEN 'LOW_DATA'
              WHEN v_responsiveness_score > 0.55 THEN 'VIEWER'
              WHEN v_responsiveness_score < 0.45 THEN 'OTHER'
              ELSE 'BALANCED'
            END,
          'title', 'Ответность',
          'description',
            CASE
              WHEN v_responsiveness_score IS NULL THEN 'В этот день не было ответов на запреты.'
              WHEN v_responsiveness_score > 0.55 THEN concat('В этот день ты чаще отвечал на запреты ', v_other_display_name, '.')
              WHEN v_responsiveness_score < 0.45 THEN concat('В этот день ', v_other_display_name, ' чаще отвечал на твои запреты.')
              ELSE 'В этот день вы отвечали друг другу примерно одинаково часто.'
            END,
          'confidenceCode', CASE WHEN v_response_sample >= 20 THEN 'HIGH' WHEN v_response_sample >= 5 THEN 'MEDIUM' WHEN v_response_sample > 0 THEN 'LOW' ELSE 'NO_DATA' END,
          'confidenceScore', LEAST(1::numeric, v_response_sample / 20),
          'sampleSize', v_response_sample
        ),
        jsonb_build_object(
          'code', 'RESPECT',
          'ring', 'INNER',
          'available', v_respect_score IS NOT NULL,
          'publishable', v_respect_score IS NOT NULL,
          'viewerShare', v_respect_score,
          'otherShare', CASE WHEN v_respect_score IS NULL THEN NULL ELSE round(1 - v_respect_score, 4) END,
          'displayValue', CASE WHEN v_respect_score IS NULL THEN NULL ELSE concat(round(v_respect_score * 100), '%') END,
          'direction',
            CASE
              WHEN v_respect_score IS NULL THEN 'LOW_DATA'
              WHEN v_respect_score > 0.55 THEN 'VIEWER'
              WHEN v_respect_score < 0.45 THEN 'OTHER'
              ELSE 'BALANCED'
            END,
          'title', 'Уважение',
          'description',
            CASE
              WHEN v_respect_score IS NULL THEN 'Чтобы сравнить уважение за день, нужны действия в обе стороны.'
              WHEN v_respect_score > 0.55 THEN concat('В этот день ты чаще выполнял запреты ', v_other_display_name, '.')
              WHEN v_respect_score < 0.45 THEN concat('В этот день ', v_other_display_name, ' чаще выполнял твои запреты.')
              ELSE 'В этот день вы выполняли запреты примерно одинаково.'
            END,
          'confidenceCode', CASE WHEN v_respect_sample >= 20 THEN 'HIGH' WHEN v_respect_sample >= 5 THEN 'MEDIUM' WHEN v_respect_sample > 0 THEN 'LOW' ELSE 'NO_DATA' END,
          'confidenceScore', LEAST(1::numeric, v_respect_sample / 20),
          'sampleSize', v_respect_sample
        )
      )
    ),
    'facts', jsonb_build_object(
      'banSentCount', v_ban_sent,
      'banReceivedCount', v_ban_received,
      'replySentCount', v_reply_sent,
      'replyReceivedCount', v_reply_received,
      'sentAcceptedCount', v_sent_accepted,
      'receivedAcceptedCount', v_received_accepted,
      'sentCompletedCount', v_sent_completed,
      'receivedCompletedCount', v_received_completed,
      'overboardCount', v_overboard,
      'bothYesCount', v_both_yes,
      'bothNoCount', v_both_no,
      'splitCount', v_split,
      'timeoutCount', v_timeout,
      'expiredCount', v_expired,
      'interactionCount', v_interactions,
      'firstBanId', v_first_ban_id,
      'lastBanId', v_last_ban_id
    ),
    'meta', jsonb_build_object(
      'contractVersion', 1,
      'dayAnalyticsVersion', 1,
      'source', 'v_relationship_daily_facts_v1',
      'generatedAt', CURRENT_TIMESTAMP
    )
  );

  RETURN jsonb_build_object(
    'viewerUserId', p_viewer_user_id,
    'otherUserId', p_other_user_id,
    'relationshipScreen', v_day_screen,
    'dayAnalytics', v_day_screen,
    'meta', jsonb_build_object(
      'contractVersion', 1,
      'dashboardVersion', 8,
      'dayAnalyticsVersion', 1,
      'selectedDate', to_char(p_activity_date, 'YYYY-MM-DD'),
      'generatedAt', CURRENT_TIMESTAMP
    )
  );
END;
$function$
;