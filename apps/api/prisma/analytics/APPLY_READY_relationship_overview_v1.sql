-- Aggregate relationship overview across all peers for one viewer.

CREATE OR REPLACE FUNCTION analytics.get_relationship_overview_v1(
  p_viewer_user_id text,
  p_range_code text,
  p_anchor_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'analytics', 'public'
AS $function$
DECLARE
  v_anchor_date date;
  v_start_date date;
  v_day_count integer;
  v_use_date_filter boolean := true;

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
  v_peer_count bigint := 0;
  v_min_activity_date date;
  v_max_activity_date date;

  v_initiative_sample numeric;
  v_response_sample numeric;
  v_respect_sample numeric;

  v_initiative_score numeric;
  v_responsiveness_score numeric;
  v_respect_score numeric;

  v_viewer_respect_rate numeric;
  v_other_respect_rate numeric;

  v_summary text;
  v_overview jsonb;
BEGIN
  IF p_range_code NOT IN ('1D', '1W', '1M', '1Y', 'ALL') THEN
    RAISE EXCEPTION 'invalid range code: %', p_range_code;
  END IF;

  IF p_range_code = 'ALL' THEN
    v_use_date_filter := false;
    v_anchor_date := NULL;
    v_start_date := NULL;
    v_day_count := NULL;
  ELSE
    v_anchor_date := COALESCE(p_anchor_date, CURRENT_DATE);
    v_start_date :=
      CASE p_range_code
        WHEN '1D' THEN v_anchor_date
        WHEN '1W' THEN v_anchor_date - 6
        WHEN '1M' THEN v_anchor_date - 29
        WHEN '1Y' THEN v_anchor_date - 364
      END;
    v_day_count := (v_anchor_date - v_start_date) + 1;
  END IF;

  SELECT
    COALESCE(SUM(d.ban_sent_count), 0),
    COALESCE(SUM(d.ban_received_count), 0),
    COALESCE(SUM(d.reply_sent_count), 0),
    COALESCE(SUM(d.reply_received_count), 0),
    COALESCE(SUM(d.sent_accepted_count), 0),
    COALESCE(SUM(d.received_accepted_count), 0),
    COALESCE(SUM(d.sent_completed_count), 0),
    COALESCE(SUM(d.received_completed_count), 0),
    COALESCE(SUM(d.overboard_count), 0),
    COALESCE(SUM(d.both_yes_count), 0),
    COALESCE(SUM(d.both_no_count), 0),
    COALESCE(SUM(d.split_count), 0),
    COALESCE(SUM(d.timeout_count), 0),
    COALESCE(SUM(d.expired_count), 0),
    COALESCE(SUM(d.interaction_count), 0),
    COUNT(DISTINCT d.other_user_id) FILTER (WHERE d.interaction_count > 0),
    MIN(d.activity_date),
    MAX(d.activity_date)
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
    v_peer_count,
    v_min_activity_date,
    v_max_activity_date
  FROM analytics.v_relationship_daily_facts_v1 d
  WHERE d.viewer_user_id = p_viewer_user_id
    AND (
      NOT v_use_date_filter
      OR d.activity_date BETWEEN v_start_date AND v_anchor_date
    );

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
      WHEN v_interactions = 0 THEN 'За выбранный период ещё не было действий с людьми.'
      WHEN v_initiative_score > 0.55 THEN 'За выбранный период ты чаще начинал взаимодействие.'
      WHEN v_initiative_score < 0.45 THEN 'За выбранный период другие люди чаще начинали взаимодействие.'
      ELSE 'За выбранный период твои отношения с людьми выглядят достаточно сбалансированными.'
    END;

  v_overview := jsonb_build_object(
    'contractVersion', 1,
    'screen', 'RELATIONSHIP_OVERVIEW',
    'selectedRange', p_range_code,
    'period', jsonb_build_object(
      'startDate',
        CASE
          WHEN p_range_code = 'ALL' THEN to_char(v_min_activity_date, 'YYYY-MM-DD')
          ELSE to_char(v_start_date, 'YYYY-MM-DD')
        END,
      'endDate',
        CASE
          WHEN p_range_code = 'ALL' THEN to_char(v_max_activity_date, 'YYYY-MM-DD')
          ELSE to_char(v_anchor_date, 'YYYY-MM-DD')
        END,
      'dayCount', v_day_count
    ),
    'status', CASE WHEN v_interactions > 0 THEN 'HAS_DATA' ELSE 'NO_ACTIVITY' END,
    'title', 'твои отношения с людьми',
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
              WHEN v_initiative_score IS NULL THEN 'За выбранный период не было запретов с людьми.'
              WHEN v_initiative_score > 0.55 THEN 'За выбранный период ты чаще начинал запреты.'
              WHEN v_initiative_score < 0.45 THEN 'За выбранный период другие люди чаще начинали запреты.'
              ELSE 'За выбранный период вы начинали запреты примерно одинаково часто.'
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
              WHEN v_responsiveness_score IS NULL THEN 'За выбранный период не было ответов на запреты.'
              WHEN v_responsiveness_score > 0.55 THEN 'За выбранный период ты чаще отвечал на запреты.'
              WHEN v_responsiveness_score < 0.45 THEN 'За выбранный период другие люди чаще отвечали на твои запреты.'
              ELSE 'За выбранный период вы отвечали примерно одинаково часто.'
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
              WHEN v_respect_score IS NULL THEN 'Чтобы сравнить уважение за период, нужны действия в обе стороны.'
              WHEN v_respect_score > 0.55 THEN 'За выбранный период ты чаще выполнял запреты других людей.'
              WHEN v_respect_score < 0.45 THEN 'За выбранный период другие люди чаще выполняли твои запреты.'
              ELSE 'За выбранный период вы выполняли запреты примерно одинаково.'
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
      'peerCount', v_peer_count
    ),
    'meta', jsonb_build_object(
      'contractVersion', 1,
      'overviewAnalyticsVersion', 1,
      'source', 'v_relationship_daily_facts_v1',
      'generatedAt', CURRENT_TIMESTAMP
    )
  );

  RETURN jsonb_build_object(
    'viewerUserId', p_viewer_user_id,
    'relationshipScreen', v_overview,
    'relationshipOverview', v_overview,
    'overviewAnalytics', v_overview,
    'meta', jsonb_build_object(
      'contractVersion', 1,
      'overviewAnalyticsVersion', 1,
      'selectedRange', p_range_code,
      'anchorDate', CASE WHEN v_anchor_date IS NULL THEN NULL ELSE to_char(v_anchor_date, 'YYYY-MM-DD') END,
      'startDate',
        CASE
          WHEN p_range_code = 'ALL' THEN to_char(v_min_activity_date, 'YYYY-MM-DD')
          ELSE to_char(v_start_date, 'YYYY-MM-DD')
        END,
      'endDate',
        CASE
          WHEN p_range_code = 'ALL' THEN to_char(v_max_activity_date, 'YYYY-MM-DD')
          ELSE to_char(v_anchor_date, 'YYYY-MM-DD')
        END,
      'dayCount', v_day_count,
      'peerCount', v_peer_count,
      'generatedAt', CURRENT_TIMESTAMP
    )
  );
END;
$function$
;
