-- =============================================================================
-- INTROSPECTION_15_outcome_sources.sql
-- purpose: discover real outcome / direction / timestamp sources for RESPECT
-- mode: READ-ONLY — SELECT only
-- =============================================================================
-- No CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
-- No assumed data-column names in typed SELECTs until Step A confirms them.
-- Paste ALL result grids back before uncommenting APPLY_READY view SQL.
-- =============================================================================

-- #############################################################################
-- STEP A — columns first (potential source objects)
-- #############################################################################

-- A1) Candidate object existence (tables + views in public / analytics)
select
  n.nspname as table_schema,
  c.relname as table_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'matview'
    else c.relkind::text
  end as object_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'analytics')
  and c.relkind in ('r', 'v', 'm')
  and (
    c.relname in (
      'Ban',
      'BanCheckAnswer',
      'BanThread',
      'PairDailyStat'
    )
    or c.relname ilike '%ban%'
    or c.relname ilike '%outcome%'
    or c.relname ilike '%pair%'
    or c.relname ilike '%interaction%'
    or c.relname ilike '%directional%'
  )
order by table_schema, object_type, table_name;

-- A2) Columns for every candidate that exists (information_schema only)
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where (
    (c.table_schema = 'public' and c.table_name in (
      'Ban', 'BanCheckAnswer', 'BanThread', 'PairDailyStat'
    ))
    or (c.table_schema = 'analytics' and (
      c.table_name ilike '%pair%'
      or c.table_name ilike '%directional%'
      or c.table_name ilike '%outcome%'
      or c.table_name ilike '%ban%'
    ))
  )
order by c.table_schema, c.table_name, c.ordinal_position;

-- A3) Existence checklist for expected Ban / direction / timestamp names
--     (information_schema only — never queries Ban data with assumed cols)
select
  expected.table_schema,
  expected.table_name,
  expected.column_name as expected_column,
  (c.column_name is not null) as exists_in_production
from (
  values
    ('public', 'Ban', 'id'),
    ('public', 'Ban', 'senderId'),
    ('public', 'Ban', 'receiverId'),
    ('public', 'Ban', 'outcome'),
    ('public', 'Ban', 'status'),
    ('public', 'Ban', 'isOverboard'),
    ('public', 'Ban', 'createdAt'),
    ('public', 'Ban', 'completedAt'),
    ('public', 'Ban', 'acceptedAt'),
    ('public', 'Ban', 'handledAt'),
    ('public', 'Ban', 'checkStartedAt'),
    ('public', 'Ban', 'expiresAt'),
    ('public', 'Ban', 'updatedAt'),
    ('public', 'Ban', 'resolved_at'),
    ('public', 'Ban', 'finished_at'),
    ('public', 'Ban', 'checked_at'),
    ('public', 'BanCheckAnswer', 'banId'),
    ('public', 'BanCheckAnswer', 'userId'),
    ('public', 'BanCheckAnswer', 'completed')
) as expected(table_schema, table_name, column_name)
left join information_schema.columns c
  on c.table_schema = expected.table_schema
 and c.table_name = expected.table_name
 and c.column_name = expected.column_name
order by expected.table_name, expected.column_name;

-- #############################################################################
-- STEP B — safe row dumps (SELECT * only — no assumed column list)
-- #############################################################################

-- B1) Ban sample (structure proof)
select *
from public."Ban"
limit 20;

-- B2) BanCheckAnswer sample
select *
from public."BanCheckAnswer"
limit 20;

-- #############################################################################
-- STEP C–F — typed Ban queries
-- #############################################################################
-- COMMENTED by default to avoid 42703 if production column names differ.
-- After A3 shows exists_in_production=true for every quoted column below,
-- uncomment and re-run ONLY this block.
-- #############################################################################

/*
-- C1) Distinct outcome values
select outcome::text as outcome_value, count(*)::bigint as n
from public."Ban"
group by 1
order by n desc;

-- C2) Distinct status values
select status::text as status_value, count(*)::bigint as n
from public."Ban"
group by 1
order by n desc;

-- C3) Outcome × status
select
  outcome::text as outcome_value,
  status::text as status_value,
  count(*)::bigint as n
from public."Ban"
group by 1, 2
order by n desc;

-- C4) isOverboard × outcome
select
  "isOverboard" as is_overboard,
  outcome::text as outcome_value,
  count(*)::bigint as n
from public."Ban"
group by 1, 2
order by n desc;

-- D) Directionality sample
select
  id,
  "senderId",
  "receiverId",
  status::text as status_value,
  outcome::text as outcome_value,
  "isOverboard",
  "createdAt",
  "completedAt",
  "acceptedAt",
  "handledAt"
from public."Ban"
where outcome::text in (
  'BOTH_YES', 'BOTH_NO', 'OVERBOARD', 'SPLIT', 'TIMEOUT', 'EXPIRED'
)
   or status::text in ('OVERBOARD', 'FAILED', 'COMPLETED')
order by coalesce("completedAt", "createdAt") desc nulls last
limit 40;

-- E) Timestamp non-null rates
select
  count(*)::bigint as ban_rows,
  count("createdAt")::bigint as n_created_at,
  count("completedAt")::bigint as n_completed_at,
  count("acceptedAt")::bigint as n_accepted_at,
  count("handledAt")::bigint as n_handled_at,
  count("checkStartedAt")::bigint as n_check_started_at,
  count(*) filter (
    where outcome::text in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD')
  )::bigint as n_respect_outcomes,
  count("completedAt") filter (
    where outcome::text in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD')
  )::bigint as n_respect_with_completed_at
from public."Ban";

-- F) sample_size double-count check
-- Each Ban row = one directed sender→receiver action.
-- viewerDenom + otherDenom uses opposite directions → different rows.
select
  count(*)::bigint as respect_outcome_rows,
  count(distinct id)::bigint as distinct_ban_ids,
  count(distinct ("senderId", "receiverId"))::bigint as distinct_directed_pairs,
  count(distinct (
    least("senderId", "receiverId"),
    greatest("senderId", "receiverId")
  ))::bigint as distinct_undirected_pairs
from public."Ban"
where outcome::text in ('BOTH_YES', 'BOTH_NO', 'OVERBOARD');
*/

-- #############################################################################
-- STEP G — analytics pair / directional object columns (no defs yet)
-- #############################################################################

select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.ordinal_position
from information_schema.columns c
where c.table_schema = 'analytics'
  and c.table_name in (
    'v_relationship_directional_facts_v0',
    'v_relationship_metrics_v0',
    'v_relationship_metric_values_v1',
    'v_pair_summary',
    'v_pair_survived_count',
    'v_pair_overboard_count',
    'v_pair_both_no_count',
    'v_pair_split_count',
    'v_pair_timeout_count',
    'v_pair_reply_count',
    'v_pair_agreement_count'
  )
order by c.table_name, c.ordinal_position;
