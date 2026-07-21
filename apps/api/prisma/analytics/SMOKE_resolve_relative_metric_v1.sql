-- =============================================================================
-- SQL smoke cases for resolve_relative_metric_v1 (read-only SELECTs)
-- Run after applying resolve_relative_metric_v1.sql
-- =============================================================================

select 'CASE1' as case_id, * from analytics.resolve_relative_metric_v1(0.78, 0.54);
select 'CASE2' as case_id, * from analytics.resolve_relative_metric_v1(50, 50);
select 'CASE3' as case_id, * from analytics.resolve_relative_metric_v1(90, 30);
select 'CASE4' as case_id, * from analytics.resolve_relative_metric_v1(null, 0.5);
select 'CASE5' as case_id, * from analytics.resolve_relative_metric_v1(0, 0);
select 'CASE6' as case_id, * from analytics.resolve_relative_metric_v1(0, 0.8);
select 'CASE7' as case_id, * from analytics.resolve_relative_metric_v1(0.8, 0);
select 'CASE8' as case_id, * from analytics.resolve_relative_metric_v1(-0.1, 0.8);
select 'CASE9' as case_id, * from analytics.resolve_relative_metric_v1(0.0000001, 0.0000001);
