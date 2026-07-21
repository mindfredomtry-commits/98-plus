-- =============================================================================
-- INTROSPECTION_13_dimension_rules_catalog.sql
-- purpose: discover real catalog columns, then dump production rows safely
-- mode: READ-ONLY — SELECT only
-- =============================================================================
-- No CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
-- No pg_get_viewdef.
-- No assumed columns in data SELECTs (no hardcoded id/name/display_order/…).
-- Paste A1–A3 (+ B + F1–F3) back into chat before any catalog INSERT work.
-- =============================================================================

-- #############################################################################
-- STEP 1 — real columns (run first; these never assume data-column names)
-- #############################################################################

-- A1) dimension_definition columns
select
  column_name,
  data_type,
  ordinal_position
from information_schema.columns
where table_schema = 'analytics'
  and table_name = 'dimension_definition'
order by ordinal_position;

-- A2) dimension_rule columns
select
  column_name,
  data_type,
  ordinal_position
from information_schema.columns
where table_schema = 'analytics'
  and table_name = 'dimension_rule'
order by ordinal_position;

-- A3) confidence_rule columns
select
  column_name,
  data_type,
  ordinal_position
from information_schema.columns
where table_schema = 'analytics'
  and table_name = 'confidence_rule'
order by ordinal_position;

-- #############################################################################
-- STEP 2 — existence checklist (information_schema only)
-- #############################################################################
-- Reports whether each candidate column exists. Does not query catalog data.
-- Used to decide which fields are safe for a later refined F1–F4.

select
  expected.table_name,
  expected.column_name as expected_column,
  (c.column_name is not null) as exists_in_production
from (
  values
    -- dimension_definition candidates
    ('dimension_definition', 'id'),
    ('dimension_definition', 'metric_code'),
    ('dimension_definition', 'dimension_code'),
    ('dimension_definition', 'code'),
    ('dimension_definition', 'name'),
    ('dimension_definition', 'dimension_name'),
    ('dimension_definition', 'title'),
    ('dimension_definition', 'display_order'),
    ('dimension_definition', 'is_active'),
    -- dimension_rule candidates
    ('dimension_rule', 'id'),
    ('dimension_rule', 'dimension_code'),
    ('dimension_rule', 'metric_code'),
    ('dimension_rule', 'result_code'),
    ('dimension_rule', 'result_name'),
    ('dimension_rule', 'description'),
    ('dimension_rule', 'min_value'),
    ('dimension_rule', 'max_value'),
    ('dimension_rule', 'is_active'),
    -- confidence_rule candidates
    ('confidence_rule', 'id'),
    ('confidence_rule', 'object_type'),
    ('confidence_rule', 'object_code'),
    ('confidence_rule', 'dimension_code'),
    ('confidence_rule', 'metric_code'),
    ('confidence_rule', 'confidence_code'),
    ('confidence_rule', 'result_code'),
    ('confidence_rule', 'result_name'),
    ('confidence_rule', 'description'),
    ('confidence_rule', 'min_sample_size'),
    ('confidence_rule', 'max_sample_size'),
    ('confidence_rule', 'is_active')
) as expected(table_name, column_name)
left join information_schema.columns c
  on c.table_schema = 'analytics'
 and c.table_name = expected.table_name
 and c.column_name = expected.column_name
order by expected.table_name, expected.column_name;

-- #############################################################################
-- STEP 3 — production row dumps (no column-name assumptions)
-- #############################################################################
-- SELECT * uses whatever columns actually exist.
-- No WHERE / ORDER BY on named columns (those names are unproven until A1–A3).
-- Filtered / joined F1–F4 will be rebuilt ONLY after A1–A3 paste confirms names.
-- Do not invent substitutes. Do not COALESCE. Do not placeholder.

-- F1) dimension_definition — all production rows
select *
from analytics.dimension_definition;

-- F2) dimension_rule — all production rows
-- (filter to INITIATIVE/RESPONSIVENESS only after A2 confirms filter column name)
select *
from analytics.dimension_rule;

-- F3) confidence_rule — all production rows
-- (filter to DIMENSION + INITIATIVE/RESPONSIVENESS after A3 confirms columns)
select *
from analytics.confidence_rule;

-- F4) JOIN — intentionally omitted in this revision.
-- Cannot join without proven join keys from A1–A3.
-- After paste of A1–A3 (+ F1–F3), a typed F4 will be added using only
-- columns that exist_in_production = true.
