-- =============================================================================
-- DEPRECATED — Phase 9C script superseded by Phase 9D
-- =============================================================================
-- Use instead:
--   apps/api/scripts/phase9d-global-ban-reset-preview.sql   (SELECT only)
--   apps/api/scripts/phase9d-global-ban-reset-execute.sql   (BEGIN…COMMIT)
--
-- Phase 9D changes vs 9C:
--   - Journal uses DELETE (no TRUNCATE RESTART IDENTITY)
--   - split preview vs execute
--   - in-transaction assertions with RAISE EXCEPTION rollback
-- DO NOT EXECUTE this file.
-- =============================================================================
SELECT 'DEPRECATED: use phase9d-global-ban-reset-preview.sql / phase9d-global-ban-reset-execute.sql'
  AS notice;
