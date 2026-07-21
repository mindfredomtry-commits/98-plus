-- =============================================================================
-- SQL smoke checks for get_relationship_overview_v1 contract
-- Run after applying APPLY_READY_relationship_overview_v1.sql
-- Replace :viewer_user_id with a real viewer id that has facts (or any id for NO_ACTIVITY).
-- =============================================================================

-- Contract keys + dimension count (expect 3 dimensions when HAS_DATA or LOW_DATA arcs)
WITH payload AS (
  SELECT analytics.get_relationship_overview_v1(
    'REPLACE_VIEWER_USER_ID',
    'ALL',
    NULL
  ) AS payload
)
SELECT
  'contract' AS check_id,
  (payload ? 'relationshipScreen') AS has_relationship_screen,
  (payload ? 'relationshipOverview') AS has_relationship_overview,
  (payload ? 'overviewAnalytics') AS has_overview_analytics,
  jsonb_array_length(
    payload #> '{relationshipScreen,relationshipOrb,dimensions}'
  ) AS relationship_screen_dimension_count,
  jsonb_array_length(
    payload #> '{relationshipOverview,relationshipOrb,dimensions}'
  ) AS relationship_overview_dimension_count
FROM payload;
