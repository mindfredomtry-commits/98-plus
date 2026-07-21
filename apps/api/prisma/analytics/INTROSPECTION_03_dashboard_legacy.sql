-- =============================================================================
-- INTROSPECTION_03_dashboard_legacy.sql
-- purpose: definitions for dashboard v5..v1 (one SELECT each)
-- expected output: status + view_definition per version, with object_name
-- run order: 8 (optional — only if still needed after v7/v6)
-- read-only: YES — SELECT only; no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE
-- =============================================================================

-- v5
select
  'v_relationship_dashboard_v5'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v5') is null
      then 'MISSING'
    else 'EXISTS'
  end as status,
  case
    when to_regclass('analytics.v_relationship_dashboard_v5') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_dashboard_v5'::regclass, true)
  end as view_definition;

-- v4
select
  'v_relationship_dashboard_v4'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v4') is null
      then 'MISSING'
    else 'EXISTS'
  end as status,
  case
    when to_regclass('analytics.v_relationship_dashboard_v4') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_dashboard_v4'::regclass, true)
  end as view_definition;

-- v3
select
  'v_relationship_dashboard_v3'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v3') is null
      then 'MISSING'
    else 'EXISTS'
  end as status,
  case
    when to_regclass('analytics.v_relationship_dashboard_v3') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_dashboard_v3'::regclass, true)
  end as view_definition;

-- v2
select
  'v_relationship_dashboard_v2'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v2') is null
      then 'MISSING'
    else 'EXISTS'
  end as status,
  case
    when to_regclass('analytics.v_relationship_dashboard_v2') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_dashboard_v2'::regclass, true)
  end as view_definition;

-- v1
select
  'v_relationship_dashboard_v1'::text as object_name,
  case
    when to_regclass('analytics.v_relationship_dashboard_v1') is null
      then 'MISSING'
    else 'EXISTS'
  end as status,
  case
    when to_regclass('analytics.v_relationship_dashboard_v1') is null
      then null
    else pg_get_viewdef('analytics.v_relationship_dashboard_v1'::regclass, true)
  end as view_definition;
